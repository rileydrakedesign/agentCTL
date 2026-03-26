import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { scanServer } from "../../src/mcp/client.js";
import { computeBudgets } from "../../src/tokens/budget.js";
import type { McpServerConfig, ScanResult } from "../../src/types.js";

const MOCK_SERVER = resolve(__dirname, "../fixtures/mock-server.ts");
const TMP_DIR = resolve(__dirname, "../../.test-tmp");

function mockConfig(tools: object[]): McpServerConfig {
  return {
    command: "npx",
    args: ["tsx", MOCK_SERVER],
    env: {
      MOCK_SERVER_CONFIG: JSON.stringify({ tools }),
    },
  };
}

describe("plan pipeline integration", () => {
  it("computes budgets from live scan results", async () => {
    const config = mockConfig([
      {
        name: "create_issue",
        description: "Create a new issue in the project tracker with title and body",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Issue title" },
            body: { type: "string", description: "Issue body" },
          },
          required: ["title"],
        },
      },
      {
        name: "list_issues",
        description: "List all open issues in the project sorted by creation date",
      },
    ]);

    const result = await scanServer("test", config);
    expect(result.status).toBe("ok");

    const scan: ScanResult = {
      version: 1,
      timestamp: new Date().toISOString(),
      servers: [result],
    };

    const { budgets, target_reports } = await computeBudgets(
      scan,
      [],
      [{ model: "claude-sonnet-4-6", context_window: 200_000 }],
    );

    expect(budgets.discovery_tokens).toBeGreaterThan(0);
    expect(budgets.skill_tokens).toBe(0);
    expect(budgets.total_typical).toBeGreaterThan(budgets.discovery_tokens);
    expect(target_reports).toHaveLength(1);
    expect(target_reports[0].fits).toBe(true);
    expect(target_reports[0].discovery_usage_pct).toBeLessThan(1); // 2 small tools
  }, 30_000);

  it("works with cached scan.json", async () => {
    await mkdir(TMP_DIR, { recursive: true });

    const scan: ScanResult = {
      version: 1,
      timestamp: new Date().toISOString(),
      servers: [
        {
          server: "cached-test",
          status: "ok",
          transport: "stdio",
          tools: [
            {
              name: "cached_tool",
              description: "A tool from the cache",
              input_schema: { type: "object", properties: {} },
              token_estimate: { description_tokens: 10, schema_tokens: 15, total: 25 },
            },
          ],
          latency_ms: 50,
          diagnostics: [],
        },
      ],
    };

    await writeFile(resolve(TMP_DIR, "scan.json"), JSON.stringify(scan, null, 2));

    const loaded: ScanResult = JSON.parse(
      await readFile(resolve(TMP_DIR, "scan.json"), "utf-8"),
    );

    const { budgets } = await computeBudgets(
      loaded,
      [],
      [{ model: "claude-sonnet-4-6", context_window: 200_000 }],
    );

    expect(budgets.discovery_tokens).toBe(25);
    expect(budgets.total_typical).toBe(25 + Math.round(25 * 0.3));

    await rm(TMP_DIR, { recursive: true, force: true });
  });

  it("handles mixed success/failure in scan results", async () => {
    const goodConfig = mockConfig([
      { name: "good_tool", description: "This tool works correctly and returns results" },
    ]);
    const badConfig: McpServerConfig = {
      command: "nonexistent-command-xyz",
      args: [],
    };

    const [good, bad] = await Promise.all([
      scanServer("good", goodConfig),
      scanServer("bad", badConfig),
    ]);

    const scan: ScanResult = {
      version: 1,
      timestamp: new Date().toISOString(),
      servers: [good, bad],
    };

    expect(scan.servers.filter((s) => s.status === "ok")).toHaveLength(1);
    expect(scan.servers.filter((s) => s.status === "error")).toHaveLength(1);

    const { budgets } = await computeBudgets(
      scan,
      [],
      [{ model: "claude-sonnet-4-6", context_window: 200_000 }],
    );

    // Budget should only include tokens from the working server
    expect(budgets.discovery_tokens).toBeGreaterThan(0);
  }, 30_000);
});
