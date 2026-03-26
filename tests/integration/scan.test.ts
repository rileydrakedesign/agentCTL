import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { scanServer } from "../../src/mcp/client.js";
import type { McpServerConfig } from "../../src/types.js";

const MOCK_SERVER = resolve(__dirname, "../fixtures/mock-server.ts");

function mockConfig(tools: object[], delay?: number): McpServerConfig {
  return {
    command: "npx",
    args: ["tsx", MOCK_SERVER],
    env: {
      MOCK_SERVER_CONFIG: JSON.stringify({ tools, delay }),
    },
  };
}

describe("scanServer integration", () => {
  it("discovers tools from a mock server", async () => {
    const config = mockConfig([
      { name: "tool_a", description: "First tool for testing purposes" },
      { name: "tool_b", description: "Second tool for testing purposes" },
      { name: "tool_c", description: "Third tool for testing purposes" },
    ]);

    const result = await scanServer("mock", config);

    expect(result.status).toBe("ok");
    expect(result.server).toBe("mock");
    expect(result.transport).toBe("stdio");
    expect(result.tools).toHaveLength(3);
    expect(result.tools[0].name).toBe("tool_a");
    expect(result.tools[0].token_estimate.total).toBeGreaterThan(0);
    expect(result.latency_ms).toBeGreaterThan(0);
    expect(result.diagnostics).toHaveLength(0);
  }, 30_000);

  it("handles server with 0 tools", async () => {
    const config = mockConfig([]);
    const result = await scanServer("empty", config);

    expect(result.status).toBe("ok");
    expect(result.tools).toHaveLength(0);
  }, 30_000);

  it("handles connection timeout", async () => {
    const config = mockConfig(
      [{ name: "slow", description: "This is slow" }],
      60_000, // 60s delay — will exceed our 2s timeout
    );

    const result = await scanServer("slow", config, 2_000);

    expect(result.status).toBe("error");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].type).toBe("timeout");
  }, 15_000);

  it("handles non-existent command", async () => {
    const config: McpServerConfig = {
      command: "nonexistent-command-that-does-not-exist",
      args: [],
    };

    const result = await scanServer("bad", config);

    expect(result.status).toBe("error");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].type).toBe("connectivity_failure");
  }, 15_000);

  it("detects redundancy across two mock servers", async () => {
    const { detectRedundancy } = await import("../../src/analysis/redundancy.js");

    const configA = mockConfig([
      {
        name: "search_files",
        description:
          "Search for files in the repository using a text query string to find matching content across all files and return results with line numbers and context",
      },
    ]);
    const configB = mockConfig([
      {
        name: "find_code",
        description:
          "Search for files in the repository using a text query string to find matching content across all files and return results with line numbers and context",
      },
    ]);

    const [resultA, resultB] = await Promise.all([
      scanServer("server-a", configA),
      scanServer("server-b", configB),
    ]);

    expect(resultA.status).toBe("ok");
    expect(resultB.status).toBe("ok");

    const clusters = detectRedundancy([resultA, resultB]);
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    expect(clusters[0].tools).toContain("server-a:search_files");
    expect(clusters[0].tools).toContain("server-b:find_code");
  }, 30_000);
});
