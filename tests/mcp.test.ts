import { describe, it, expect } from "vitest";
import { classifyError } from "../src/mcp/client.js";

describe("classifyError", () => {
  it("classifies timeout errors", () => {
    expect(classifyError("Timed out after 30000ms")).toBe("timeout");
    expect(classifyError("Connection timeout")).toBe("timeout");
  });

  it("classifies auth errors by HTTP status", () => {
    expect(classifyError("HTTP 401 Unauthorized")).toBe("auth_failure");
    expect(classifyError("403 Forbidden")).toBe("auth_failure");
    expect(classifyError("Request unauthorized")).toBe("auth_failure");
  });

  it("classifies parse errors", () => {
    expect(classifyError("Unexpected token < in JSON")).toBe("parse_error");
    expect(classifyError("SyntaxError: invalid json")).toBe("parse_error");
    expect(classifyError("JSON parse error at position 0")).toBe("parse_error");
  });

  it("classifies connectivity errors as default", () => {
    expect(classifyError("ECONNREFUSED 127.0.0.1:3000")).toBe("connectivity_failure");
    expect(classifyError("ENOTFOUND example.com")).toBe("connectivity_failure");
    expect(classifyError("spawn npx ENOENT")).toBe("connectivity_failure");
    expect(classifyError("Something went wrong")).toBe("connectivity_failure");
  });

  it("does not false-positive 'token' as auth failure", () => {
    // "token" alone should not trigger auth_failure — it could be a JSON parse error
    expect(classifyError("Unexpected token in JSON")).toBe("parse_error");
  });
});
