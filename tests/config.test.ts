import { describe, it, expect } from "vitest";
import { mcpConfigSchema, projectConfigSchema } from "../src/config/schemas.js";

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
