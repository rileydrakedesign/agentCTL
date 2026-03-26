import { describe, it, expect } from "vitest";
import { mcpConfigSchema, projectConfigSchema } from "../src/config/schemas.js";
import { resolveHeaders } from "../src/config/discover.js";

describe("mcpConfigSchema", () => {
  it("validates a valid MCP config", () => {
    const config = {
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_TOKEN: "token" },
        },
      },
    };
    expect(() => mcpConfigSchema.parse(config)).not.toThrow();
  });

  it("validates SSE transport config", () => {
    const config = {
      mcpServers: {
        remote: {
          url: "http://localhost:3000/sse",
        },
      },
    };
    expect(() => mcpConfigSchema.parse(config)).not.toThrow();
  });

  it("validates HTTP transport with type field", () => {
    const config = {
      mcpServers: {
        supabase: {
          type: "http",
          url: "https://mcp.supabase.com/mcp",
          oauth: true,
        },
      },
    };
    expect(() => mcpConfigSchema.parse(config)).not.toThrow();
  });

  it("validates config with headers", () => {
    const config = {
      mcpServers: {
        remote: {
          type: "http",
          url: "https://example.com/mcp",
          headers: { Authorization: "Bearer my-token" },
        },
      },
    };
    expect(() => mcpConfigSchema.parse(config)).not.toThrow();
  });

  it("rejects invalid type value", () => {
    const config = {
      mcpServers: {
        remote: {
          type: "websocket",
          url: "ws://localhost:3000",
        },
      },
    };
    expect(() => mcpConfigSchema.parse(config)).toThrow();
  });

  it("rejects missing mcpServers", () => {
    expect(() => mcpConfigSchema.parse({})).toThrow();
  });
});

describe("projectConfigSchema", () => {
  it("validates a valid project config", () => {
    const config = {
      version: 1,
      project: { name: "my-project" },
      runtime_targets: [{ model: "claude-sonnet-4-6", context_window: 200000 }],
    };
    expect(() => projectConfigSchema.parse(config)).not.toThrow();
  });

  it("rejects empty project name", () => {
    const config = {
      version: 1,
      project: { name: "" },
      runtime_targets: [{ model: "claude-sonnet-4-6", context_window: 200000 }],
    };
    expect(() => projectConfigSchema.parse(config)).toThrow();
  });

  it("rejects empty runtime targets", () => {
    const config = {
      version: 1,
      project: { name: "test" },
      runtime_targets: [],
    };
    expect(() => projectConfigSchema.parse(config)).toThrow();
  });
});

describe("resolveHeaders", () => {
  it("passes through static values", () => {
    const result = resolveHeaders({ Authorization: "Bearer abc123" });
    expect(result.Authorization).toBe("Bearer abc123");
  });

  it("resolves $VAR references", () => {
    process.env.TEST_TOKEN_A = "resolved-value";
    const result = resolveHeaders({ Authorization: "Bearer $TEST_TOKEN_A" });
    expect(result.Authorization).toBe("Bearer resolved-value");
    delete process.env.TEST_TOKEN_A;
  });

  it("resolves ${VAR} references", () => {
    process.env.TEST_TOKEN_B = "resolved-braced";
    const result = resolveHeaders({ "X-Key": "${TEST_TOKEN_B}" });
    expect(result["X-Key"]).toBe("resolved-braced");
    delete process.env.TEST_TOKEN_B;
  });

  it("throws on missing env var", () => {
    delete process.env.NONEXISTENT_VAR;
    expect(() => resolveHeaders({ Auth: "$NONEXISTENT_VAR" })).toThrow("NONEXISTENT_VAR");
  });
});
