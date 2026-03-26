import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  McpServerConfig,
  ServerScanResult,
  DiscoveredTool,
  Diagnostic,
  Transport,
} from "../types.js";
import { estimateToolTokens } from "../tokens/tokenizer.js";
import { resolveHeaders } from "../config/discover.js";
import { CliOAuthClientProvider } from "./oauth.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const OAUTH_TIMEOUT_MS = 120_000;

/** Check if an error indicates OAuth authorization is needed. */
function isAuthError(err: unknown): boolean {
  if (err instanceof UnauthorizedError) return true;
  if (err instanceof StreamableHTTPError && err.code === 401) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("unauthorized") && !msg.includes("unexpected token")) return true;
  }
  return false;
}

export async function scanServer(
  name: string,
  config: McpServerConfig,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ServerScanResult> {
  const start = Date.now();
  const transport = resolveTransport(config);
  const diagnostics: Diagnostic[] = [];
  let oauthProvider: CliOAuthClientProvider | undefined;

  const client = new Client({ name: "agentctl", version: "0.1.0" });

  try {
    // Set up OAuth provider and start callback server before connect.
    // The callback server must be listening before the browser redirect arrives.
    if (transport === "http" && config.oauth) {
      // Non-interactive environment: skip OAuth, report diagnostic
      if (!process.stdout.isTTY) {
        throw new Error(
          "OAuth authorization required but running in non-interactive mode. " +
          "Use headers with a Bearer token, or run interactively to complete OAuth.",
        );
      }

      oauthProvider = new CliOAuthClientProvider(config.url!);
      // Start the callback server so the redirect URL port is assigned
      // before the SDK calls redirectToAuthorization().
      await oauthProvider.startCallbackServer();
    }

    const clientTransport = createTransport(config, transport, oauthProvider);

    // First attempt — the SDK will internally:
    // 1. Send a request to the MCP endpoint
    // 2. On 401, call auth() → redirectToAuthorization() (opens browser) → return 'REDIRECT'
    // 3. Throw UnauthorizedError because result !== 'AUTHORIZED'
    // We catch that, wait for the browser callback, finishAuth, and retry.
    try {
      await withTimeout(client.connect(clientTransport), timeoutMs);
    } catch (err) {
      if (isAuthError(err) && oauthProvider) {
        console.error(`\n  Waiting for OAuth authorization for "${name}"...`);
        console.error("  Complete the authorization in your browser.\n");

        const code = await withTimeout(oauthProvider.waitForAuthCode(), OAUTH_TIMEOUT_MS);

        if (clientTransport instanceof StreamableHTTPClientTransport) {
          await clientTransport.finishAuth(code);
        }

        // Retry connection after auth completes
        const retryClient = new Client({ name: "agentctl", version: "0.1.0" });
        const retryTransport = createTransport(config, transport, oauthProvider);
        await withTimeout(retryClient.connect(retryTransport), timeoutMs);
        // Use the retry client for tool listing
        const response = await withTimeout(retryClient.listTools(), timeoutMs);

        const tools: DiscoveredTool[] = (response.tools ?? []).map((tool) => {
          const estimate = estimateToolTokens(
            tool.description ?? "",
            tool.inputSchema as Record<string, unknown>,
          );
          return {
            name: tool.name,
            description: tool.description ?? "",
            input_schema: tool.inputSchema as Record<string, unknown>,
            token_estimate: estimate,
          };
        });

        return {
          server: name,
          status: "ok",
          transport,
          tools,
          latency_ms: Date.now() - start,
          diagnostics,
        };
      }
      throw err;
    }

    const response = await withTimeout(client.listTools(), timeoutMs);

    const tools: DiscoveredTool[] = (response.tools ?? []).map((tool) => {
      const estimate = estimateToolTokens(
        tool.description ?? "",
        tool.inputSchema as Record<string, unknown>,
      );
      return {
        name: tool.name,
        description: tool.description ?? "",
        input_schema: tool.inputSchema as Record<string, unknown>,
        token_estimate: estimate,
      };
    });

    return {
      server: name,
      status: "ok",
      transport,
      tools,
      latency_ms: Date.now() - start,
      diagnostics,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const type = classifyError(err);

    diagnostics.push({ server: name, type, message });

    return {
      server: name,
      status: "error",
      transport,
      tools: [],
      latency_ms: Date.now() - start,
      diagnostics,
    };
  } finally {
    await oauthProvider?.dispose();
    try {
      await client.close();
    } catch {
      // Ignore close errors — server may already be gone
    }
  }
}

export function resolveTransport(config: McpServerConfig): Transport {
  if (config.type) return config.type;
  if (config.url) return "http";
  return "stdio";
}

function createTransport(
  config: McpServerConfig,
  transport: Transport,
  oauthProvider?: CliOAuthClientProvider,
): StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport {
  if (transport === "http") {
    return createHttpTransport(config, oauthProvider);
  }

  if (transport === "sse") {
    return new SSEClientTransport(new URL(config.url!));
  }

  if (!config.command) {
    throw new Error("stdio transport requires a command");
  }

  return new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env
      ? { ...process.env, ...config.env } as Record<string, string>
      : undefined,
  });
}

function createHttpTransport(
  config: McpServerConfig,
  oauthProvider?: CliOAuthClientProvider,
): StreamableHTTPClientTransport {
  const url = new URL(config.url!);
  const opts: ConstructorParameters<typeof StreamableHTTPClientTransport>[1] = {};

  // Static headers (e.g., Bearer token for CI)
  if (config.headers) {
    const resolved = resolveHeaders(config.headers);
    opts.requestInit = { headers: resolved };
  }

  // OAuth provider for interactive auth
  if (oauthProvider) {
    opts.authProvider = oauthProvider;
  }

  return new StreamableHTTPClientTransport(url, opts);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out after ${ms}ms`)),
      ms,
    );
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/** Classify an error into a diagnostic type. */
export function classifyError(
  err: unknown,
): Diagnostic["type"] {
  if (err instanceof UnauthorizedError) return "oauth_required";
  if (err instanceof StreamableHTTPError && err.code === 401) return "oauth_required";

  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  // Timeout
  if (lower.includes("timeout") || lower.includes("timed out")) return "timeout";

  // OAuth-specific
  if (lower.includes("oauth")) return "oauth_required";

  // Auth — match HTTP status codes and auth-specific terms
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden")
  ) {
    return "auth_failure";
  }

  // Parse errors
  if (
    lower.includes("unexpected token") ||
    lower.includes("json parse") ||
    lower.includes("syntaxerror")
  ) {
    return "parse_error";
  }

  // Everything else is connectivity
  return "connectivity_failure";
}
