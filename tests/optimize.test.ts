import { describe, it, expect } from "vitest";
import { computeOptimizeActions } from "../src/optimize/actions.js";
import type {
  PlanReport,
  McpConfig,
  RedundancyCluster,
  DeadCapability,
  ContextWarning,
  Diagnostic,
} from "../src/types.js";

// ── Helpers ────────────────────────────────────────────

function makePlan(overrides: {
  deadCaps?: DeadCapability[];
  clusters?: RedundancyCluster[];
  warnings?: ContextWarning[];
  diagnostics?: Diagnostic[];
  mcpCosts?: Record<string, { tools: number; tokens: number }>;
}): PlanReport {
  return {
    version: 1,
    status: "success",
    project: "test",
    timestamp: new Date().toISOString(),
    inputs: { config_path: ".mcp.json", skill_dirs: [], prompt_files: [] },
    capabilities: { mcp_servers: 0, mcp_tools: 0, skills: 0 },
    budgets: {
      discovery_tokens: 0,
      prompt_tokens: 0,
      skill_tokens: 0,
      typical_activation_tokens: 0,
      worst_case_tokens: 0,
      total_typical: 0,
      total_worst_case: 0,
    },
    runtime_targets: [],
    workspace: {
      mcp_count: 0,
      tool_count: 0,
      discovery_tokens: 0,
      prompt_tokens: 0,
      total_projected: 0,
      waste_percentage: 0,
      mcp_costs: overrides.mcpCosts ?? {},
      redundancy_clusters: overrides.clusters ?? [],
      warnings: [],
    },
    analysis: {
      redundancy_clusters: overrides.clusters ?? [],
      dead_capabilities: overrides.deadCaps ?? [],
      warnings: overrides.warnings ?? [],
    },
    recommendations: [],
    diagnostics: overrides.diagnostics ?? [],
  };
}

function makeConfig(serverNames: string[]): McpConfig {
  const mcpServers: Record<string, { command: string }> = {};
  for (const name of serverNames) {
    mcpServers[name] = { command: "npx" };
  }
  return { mcpServers };
}

const DEFAULT_OPTS = { removeDead: true, consolidate: true };

// ── Tests ──────────────────────────────────────────────

describe("computeOptimizeActions", () => {
  it("returns empty for no issues", () => {
    const plan = makePlan({});
    const config = makeConfig(["github"]);
    const { actions, manualFindings } = computeOptimizeActions(plan, config, DEFAULT_OPTS);
    expect(actions).toEqual([]);
    expect(manualFindings).toEqual([]);
  });

  it("detects dead server (tool='*')", () => {
    const plan = makePlan({
      deadCaps: [{ server: "empty-mcp", tool: "*", reason: "Server returned 0 tools" }],
      mcpCosts: { "empty-mcp": { tools: 0, tokens: 0 } },
    });
    const config = makeConfig(["empty-mcp", "github"]);
    const { actions } = computeOptimizeActions(plan, config, DEFAULT_OPTS);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("remove_dead_server");
    expect(actions[0].server).toBe("empty-mcp");
  });

  it("detects failed server via diagnostics", () => {
    const plan = makePlan({
      diagnostics: [
        { server: "broken", type: "connectivity_failure", message: "Connection refused" },
      ],
    });
    const config = makeConfig(["broken", "github"]);
    const { actions } = computeOptimizeActions(plan, config, DEFAULT_OPTS);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("remove_dead_server");
    expect(actions[0].rationale).toContain("failed to connect");
  });

  it("reports dead tool in live server as ManualFinding", () => {
    const plan = makePlan({
      deadCaps: [{ server: "github", tool: "bad_tool", reason: "Empty or near-empty description" }],
      mcpCosts: { github: { tools: 5, tokens: 200 } },
    });
    const config = makeConfig(["github"]);
    const { actions, manualFindings } = computeOptimizeActions(plan, config, DEFAULT_OPTS);
    expect(actions).toEqual([]);
    expect(manualFindings).toHaveLength(1);
    expect(manualFindings[0].issue).toBe("dead_tool");
    expect(manualFindings[0].tool).toBe("bad_tool");
  });

  it("detects fully redundant server for removal", () => {
    // serverA has 2 tools, both redundant with serverB which has 5 tools
    const plan = makePlan({
      clusters: [
        {
          tools: ["small-mcp:tool1", "big-mcp:toolA"],
          similarity: 0.9,
          token_savings_if_consolidated: 20,
        },
        {
          tools: ["small-mcp:tool2", "big-mcp:toolB"],
          similarity: 0.85,
          token_savings_if_consolidated: 20,
        },
      ],
      mcpCosts: {
        "small-mcp": { tools: 2, tokens: 40 },
        "big-mcp": { tools: 5, tokens: 200 },
      },
    });
    const config = makeConfig(["small-mcp", "big-mcp"]);
    const { actions, manualFindings } = computeOptimizeActions(plan, config, DEFAULT_OPTS);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("remove_redundant_server");
    expect(actions[0].server).toBe("small-mcp");
    expect(actions[0].token_savings).toBe(40);
    expect(manualFindings).toEqual([]);
  });

  it("reports partial redundancy as ManualFinding", () => {
    // serverA has 3 tools, only 1 redundant with serverB
    const plan = makePlan({
      clusters: [
        {
          tools: ["alpha:tool1", "beta:toolX"],
          similarity: 0.92,
          token_savings_if_consolidated: 20,
        },
      ],
      mcpCosts: {
        alpha: { tools: 3, tokens: 100 },
        beta: { tools: 4, tokens: 150 },
      },
    });
    const config = makeConfig(["alpha", "beta"]);
    const { actions, manualFindings } = computeOptimizeActions(plan, config, DEFAULT_OPTS);
    expect(actions).toEqual([]);
    expect(manualFindings).toHaveLength(1);
    expect(manualFindings[0].issue).toBe("partial_redundancy");
  });

  it("deduplicates server in both dead and redundant (dead wins)", () => {
    const plan = makePlan({
      deadCaps: [{ server: "dup-server", tool: "*", reason: "Server returned 0 tools" }],
      clusters: [
        {
          tools: ["dup-server:tool1", "other:toolA"],
          similarity: 0.9,
          token_savings_if_consolidated: 20,
        },
      ],
      mcpCosts: {
        "dup-server": { tools: 0, tokens: 0 },
        other: { tools: 3, tokens: 100 },
      },
    });
    const config = makeConfig(["dup-server", "other"]);
    const { actions } = computeOptimizeActions(plan, config, DEFAULT_OPTS);
    // Should only have one action (dead), not also redundant
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("remove_dead_server");
  });

  it("marks all servers for removal when all are dead", () => {
    const plan = makePlan({
      deadCaps: [
        { server: "a", tool: "*", reason: "Server returned 0 tools" },
        { server: "b", tool: "*", reason: "Server returned 0 tools" },
      ],
      mcpCosts: { a: { tools: 0, tokens: 0 }, b: { tools: 0, tokens: 0 } },
    });
    const config = makeConfig(["a", "b"]);
    const { actions } = computeOptimizeActions(plan, config, DEFAULT_OPTS);
    expect(actions).toHaveLength(2);
    expect(actions.every((a) => a.type === "remove_dead_server")).toBe(true);
  });

  it("respects removeDead=false flag", () => {
    const plan = makePlan({
      deadCaps: [{ server: "dead", tool: "*", reason: "Server returned 0 tools" }],
    });
    const config = makeConfig(["dead"]);
    const { actions } = computeOptimizeActions(plan, config, {
      removeDead: false,
      consolidate: true,
    });
    expect(actions).toEqual([]);
  });

  it("respects consolidate=false flag", () => {
    const plan = makePlan({
      clusters: [
        {
          tools: ["small:tool1", "big:toolA"],
          similarity: 0.9,
          token_savings_if_consolidated: 20,
        },
      ],
      mcpCosts: {
        small: { tools: 1, tokens: 20 },
        big: { tools: 5, tokens: 200 },
      },
    });
    const config = makeConfig(["small", "big"]);
    const { actions } = computeOptimizeActions(plan, config, {
      removeDead: true,
      consolidate: false,
    });
    expect(actions).toEqual([]);
  });

  it("ignores servers not in config", () => {
    const plan = makePlan({
      deadCaps: [{ server: "phantom", tool: "*", reason: "Server returned 0 tools" }],
    });
    const config = makeConfig(["github"]);
    const { actions } = computeOptimizeActions(plan, config, DEFAULT_OPTS);
    expect(actions).toEqual([]);
  });
});
