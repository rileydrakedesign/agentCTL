import { describe, it, expect } from "vitest";
import { classifyError, resolveTransport } from "../src/mcp/client.js";

describe("classifyError", () => {
  it("classifies timeout errors", () => {
    expect(classifyError(new Error("Timed out after 30000ms"))).toBe("timeout");
    expect(classifyError(new Error("Connection timeout"))).toBe("timeout");
  });

  it("classifies auth errors by HTTP status", () => {
    expect(classifyError(new Error("HTTP 401 Unauthorized"))).toBe("auth_failure");
    expect(classifyError(new Error("403 Forbidden"))).toBe("auth_failure");
    expect(classifyError(new Error("Request unauthorized"))).toBe("auth_failure");
  });

  it("classifies parse errors", () => {
    expect(classifyError(new Error("Unexpected token < in JSON"))).toBe("parse_error");
    expect(classifyError(new Error("SyntaxError: invalid json"))).toBe("parse_error");
    expect(classifyError(new Error("JSON parse error at position 0"))).toBe("parse_error");
  });

  it("classifies connectivity errors as default", () => {
    expect(classifyError(new Error("ECONNREFUSED 127.0.0.1:3000"))).toBe("connectivity_failure");
    expect(classifyError(new Error("ENOTFOUND example.com"))).toBe("connectivity_failure");
    expect(classifyError(new Error("spawn npx ENOENT"))).toBe("connectivity_failure");
    expect(classifyError(new Error("Something went wrong"))).toBe("connectivity_failure");
  });

  it("classifies OAuth errors", () => {
    expect(classifyError(new Error("OAuth flow incomplete"))).toBe("oauth_required");
  });

  it("does not false-positive 'token' as auth failure", () => {
    expect(classifyError(new Error("Unexpected token in JSON"))).toBe("parse_error");
  });

  it("handles string input", () => {
    expect(classifyError("ECONNREFUSED")).toBe("connectivity_failure");
  });
});

describe("resolveTransport", () => {
  it("returns stdio for command-only config", () => {
    expect(resolveTransport({ command: "npx", args: [] })).toBe("stdio");
  });

  it("returns http for url-only config", () => {
    expect(resolveTransport({ url: "https://example.com/mcp" })).toBe("http");
  });

  it("respects explicit type override", () => {
    expect(resolveTransport({ type: "sse", url: "https://example.com/sse" })).toBe("sse");
    expect(resolveTransport({ type: "http", url: "https://example.com/mcp" })).toBe("http");
    expect(resolveTransport({ type: "stdio", command: "npx" })).toBe("stdio");
  });
});
