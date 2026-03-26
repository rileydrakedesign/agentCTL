import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import type { OAuthClientProvider, OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientMetadata,
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

/** Derive a filesystem-safe key from a server URL. */
export function serverCacheKey(serverUrl: string): string {
  const hash = createHash("sha256").update(serverUrl).digest("hex").slice(0, 12);
  try {
    const url = new URL(serverUrl);
    const safe = url.hostname.replace(/[^a-z0-9.-]/gi, "_");
    return `${safe}_${hash}`;
  } catch {
    return hash;
  }
}

/** Resolve the cache directory for a given server. */
export function oauthCacheDir(serverUrl: string): string {
  return join(homedir(), ".agentctl", "oauth", serverCacheKey(serverUrl));
}

/** Check whether cached OAuth tokens exist for a server URL. */
export function hasOAuthTokens(serverUrl: string): boolean {
  return existsSync(join(oauthCacheDir(serverUrl), "tokens.json"));
}

// ── File I/O helpers ──────────────────────────────────────

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

async function readJsonFile<T>(path: string): Promise<T | undefined> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await ensureDir(join(path, ".."));
  await writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600 });
}

async function readTextFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

async function writeTextFile(path: string, data: string): Promise<void> {
  await ensureDir(join(path, ".."));
  await writeFile(path, data, { mode: 0o600 });
}

// ── Browser opening ───────────────────────────────────────

function openBrowser(url: string): void {
  const plat = platform();
  const cmd = plat === "darwin" ? "open" : plat === "win32" ? "cmd" : "xdg-open";
  const args = plat === "win32" ? ["/c", "start", url] : [url];
  execFile(cmd, args, (err) => {
    if (err) {
      // Fallback: print URL for manual opening
      console.error(`\n  Open this URL in your browser to authorize:\n  ${url}\n`);
    }
  });
}

// ── OAuth Provider ────────────────────────────────────────

const AUTH_TIMEOUT_MS = 120_000;

export class CliOAuthClientProvider implements OAuthClientProvider {
  private _serverUrl: string;
  private _cacheDir: string;
  private _callbackServer: Server | null = null;
  private _callbackPort: number | null = null;
  private _authCodePromise: Promise<string> | null = null;
  private _authCodeResolve: ((code: string) => void) | null = null;
  private _authCodeReject: ((err: Error) => void) | null = null;

  constructor(serverUrl: string) {
    this._serverUrl = serverUrl;
    this._cacheDir = oauthCacheDir(serverUrl);
  }

  get redirectUrl(): string | URL {
    if (this._callbackPort === null) {
      // Return a placeholder — the real port is set when waitForAuthCode starts the server.
      // The SDK calls redirectUrl during client registration, so we need a value here.
      return "http://127.0.0.1:0/oauth/callback";
    }
    return `http://127.0.0.1:${this._callbackPort}/oauth/callback`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "agentctl",
      redirect_uris: [typeof this.redirectUrl === "string" ? this.redirectUrl : this.redirectUrl.toString()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    return readJsonFile<OAuthClientInformationMixed>(
      join(this._cacheDir, "client-info.json"),
    );
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    await writeJsonFile(join(this._cacheDir, "client-info.json"), info);
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return readJsonFile<OAuthTokens>(join(this._cacheDir, "tokens.json"));
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await writeJsonFile(join(this._cacheDir, "tokens.json"), tokens);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    console.error("\n  Opening browser for OAuth authorization...");
    openBrowser(authorizationUrl.toString());
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await writeTextFile(join(this._cacheDir, "code-verifier.txt"), codeVerifier);
  }

  async codeVerifier(): Promise<string> {
    return readTextFile(join(this._cacheDir, "code-verifier.txt"));
  }

  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): Promise<void> {
    const targets: Record<string, string[]> = {
      all: ["tokens.json", "client-info.json", "code-verifier.txt", "discovery-state.json"],
      tokens: ["tokens.json"],
      client: ["client-info.json"],
      verifier: ["code-verifier.txt"],
      discovery: ["discovery-state.json"],
    };
    for (const file of targets[scope] ?? []) {
      try {
        await rm(join(this._cacheDir, file));
      } catch {
        // ignore missing files
      }
    }
  }

  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    await writeJsonFile(join(this._cacheDir, "discovery-state.json"), state);
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    return readJsonFile<OAuthDiscoveryState>(
      join(this._cacheDir, "discovery-state.json"),
    );
  }

  /**
   * Start the localhost callback server so the redirect URL port is assigned.
   * Call this before connect() so the SDK gets the real port in redirectUrl.
   * Returns a promise that resolves once the server is listening.
   */
  startCallbackServer(): Promise<void> {
    if (this._callbackServer) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", `http://127.0.0.1`);
        if (url.pathname !== "/oauth/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<html><body><h1>Authorization failed</h1><p>You can close this tab.</p></body></html>");
          this._authCodeReject?.(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<html><body><h1>Missing authorization code</h1></body></html>");
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><h1>Authorization successful</h1><p>You can close this tab and return to the terminal.</p></body></html>");
        this._authCodeResolve?.(code);
      });

      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          this._callbackPort = addr.port;
        }
        this._callbackServer = server;
        resolve();
      });
    });
  }

  /**
   * Wait for the OAuth auth code from the callback server.
   * startCallbackServer() must be called first.
   */
  waitForAuthCode(): Promise<string> {
    if (this._authCodePromise) return this._authCodePromise;

    this._authCodePromise = new Promise<string>((resolve, reject) => {
      this._authCodeResolve = resolve;
      this._authCodeReject = reject;

      // Timeout
      setTimeout(() => {
        reject(new Error("OAuth authorization timed out. No callback received."));
        this.dispose();
      }, AUTH_TIMEOUT_MS);
    });

    return this._authCodePromise;
  }

  /** Clean up the callback server. */
  async dispose(): Promise<void> {
    if (this._callbackServer) {
      this._callbackServer.close();
      this._callbackServer = null;
    }
  }
}
