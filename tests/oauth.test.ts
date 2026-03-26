import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import http from "node:http";
import { serverCacheKey, CliOAuthClientProvider } from "../src/mcp/oauth.js";

describe("serverCacheKey", () => {
  it("produces a deterministic key", () => {
    const key1 = serverCacheKey("https://mcp.supabase.com/mcp?project_ref=abc");
    const key2 = serverCacheKey("https://mcp.supabase.com/mcp?project_ref=abc");
    expect(key1).toBe(key2);
  });

  it("includes hostname in the key", () => {
    const key = serverCacheKey("https://mcp.supabase.com/mcp");
    expect(key).toContain("mcp.supabase.com");
  });

  it("produces different keys for different URLs", () => {
    const key1 = serverCacheKey("https://server-a.com/mcp");
    const key2 = serverCacheKey("https://server-b.com/mcp");
    expect(key1).not.toBe(key2);
  });

  it("handles invalid URLs gracefully", () => {
    const key = serverCacheKey("not-a-url");
    expect(key).toBeTruthy();
    expect(key.length).toBeGreaterThan(0);
  });
});

describe("CliOAuthClientProvider", () => {
  const testUrl = "https://test-server.example.com/mcp";
  let provider: CliOAuthClientProvider;

  afterEach(async () => {
    if (provider) {
      await provider.dispose();
    }
  });

  it("returns correct client metadata", () => {
    provider = new CliOAuthClientProvider(testUrl);
    const meta = provider.clientMetadata;
    expect(meta.client_name).toBe("agentctl");
    expect(meta.grant_types).toContain("authorization_code");
    expect(meta.grant_types).toContain("refresh_token");
    expect(meta.token_endpoint_auth_method).toBe("none");
  });

  it("returns undefined for tokens when none cached", async () => {
    provider = new CliOAuthClientProvider(testUrl);
    const tokens = await provider.tokens();
    expect(tokens).toBeUndefined();
  });

  it("returns undefined for client info when none cached", async () => {
    provider = new CliOAuthClientProvider(testUrl);
    const info = await provider.clientInformation();
    expect(info).toBeUndefined();
  });

  it("callback server receives auth code", async () => {
    provider = new CliOAuthClientProvider(testUrl);
    const codePromise = provider.waitForAuthCode();

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    const redirectUrl = provider.redirectUrl;
    const url = new URL(typeof redirectUrl === "string" ? redirectUrl : redirectUrl.toString());
    url.searchParams.set("code", "test-auth-code-123");

    // Make the callback request
    await new Promise<void>((resolve, reject) => {
      http.get(url.toString(), (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          expect(res.statusCode).toBe(200);
          expect(body).toContain("Authorization successful");
          resolve();
        });
      }).on("error", reject);
    });

    const code = await codePromise;
    expect(code).toBe("test-auth-code-123");
  });

  it("callback server rejects on OAuth error", async () => {
    provider = new CliOAuthClientProvider(testUrl);
    const codePromise = provider.waitForAuthCode();

    // Attach a catch handler immediately to prevent unhandled rejection
    codePromise.catch(() => {});

    await new Promise((resolve) => setTimeout(resolve, 100));

    const redirectUrl = provider.redirectUrl;
    const url = new URL(typeof redirectUrl === "string" ? redirectUrl : redirectUrl.toString());
    url.searchParams.set("error", "access_denied");

    await new Promise<void>((resolve) => {
      http.get(url.toString(), () => resolve());
    });

    await expect(codePromise).rejects.toThrow("OAuth error: access_denied");
  });
});
