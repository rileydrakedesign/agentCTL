import { describe, it, expect } from "vitest";
import { computeDiff, computeDiffWithScans } from "../src/diff/compute.js";
import type { PlanReport } from "../src/types.js";

function makePlan(overrides: Partial<PlanReport> = {}): PlanReport {
  return {
    version: 1,
    status: "success",
    project: "test",
    timestamp: new Date().toISOString(),
    inputs: { config_path: ".mcp.json", skill_dirs: [], prompt_files: [] },
    capabilities: { mcp_servers: 2, mcp_tools: 10, skills: 0 },
    budgets: {
      discovery_tokens: 5000,
      prompt_tokens: 500,
      skill_tokens: 0,
      typical_activation_tokens: 1500,
      worst_case_tokens: 5000,
      total_typical: 7000,
      total_worst_case: 10500,
    },
    runtime_targets: [
      {
        model: "claude-sonnet-4-6",
        context_window: 200000,
        discovery_usage_pct: 2.5,
        typical_usage_pct: 3.5,
        worst_case_usage_pct: 5.3,
        fits: true,
      },
    ],
    workspace: {
      mcp_count: 2,
      tool_count: 10,
      discovery_tokens: 5000,
      prompt_tokens: 500,
      total_projected: 7000,
      waste_percentage: 10,
      mcp_costs: {
        github: { tools: 6, tokens: 3000 },
        filesystem: { tools: 4, tokens: 2000 },
      },
      redundancy_clusters: [],
      warnings: [],
    },
    analysis: {
      redundancy_clusters: [],
      dead_capabilities: [],
      warnings: [],
    },
    recommendations: [],
    diagnostics: [],
    ...overrides,
  };
}

describe("computeDiff", () => {
  it("returns zero deltas for identical plans", () => {
    const plan = makePlan();
    const diff = computeDiff(plan, plan, "main", "current");

    expect(diff.base_ref).toBe("main");
    expect(diff.head_ref).toBe("current");
    expect(diff.budgets.discovery_tokens.delta).toBe(0);
    expect(diff.budgets.discovery_tokens.delta_pct).toBe(0);
    expect(diff.budgets.total_typical.delta).toBe(0);
    expect(diff.servers.added).toHaveLength(0);
    expect(diff.servers.removed).toHaveLength(0);
    expect(diff.servers.changed).toHaveLength(0);
  });

  it("detects added servers", () => {
    const base = makePlan();
    const head = makePlan({
      workspace: {
        ...base.workspace,
        mcp_count: 3,
        mcp_costs: {
          ...base.workspace.mcp_costs,
          linear: { tools: 14, tokens: 4200 },
        },
      },
    });

    const diff = computeDiff(base, head, "main", "current");
    expect(diff.servers.added).toHaveLength(1);
    expect(diff.servers.added[0].name).toBe("linear");
    expect(diff.servers.added[0].tools).toBe(14);
    expect(diff.servers.added[0].tokens).toBe(4200);
  });

  it("detects removed servers", () => {
    const base = makePlan();
    const head = makePlan({
      workspace: {
        ...base.workspace,
        mcp_count: 1,
        mcp_costs: {
          github: { tools: 6, tokens: 3000 },
        },
      },
    });

    const diff = computeDiff(base, head, "main", "current");
    expect(diff.servers.removed).toHaveLength(1);
    expect(diff.servers.removed[0].name).toBe("filesystem");
  });

  it("detects changed servers by token count", () => {
    const base = makePlan();
    const head = makePlan({
      workspace: {
        ...base.workspace,
        mcp_costs: {
          github: { tools: 8, tokens: 4000 },
          filesystem: { tools: 4, tokens: 2000 },
        },
      },
    });

    const diff = computeDiff(base, head, "main", "current");
    expect(diff.servers.changed).toHaveLength(1);
    expect(diff.servers.changed[0].name).toBe("github");
    expect(diff.servers.changed[0].tools_delta).toBe(2);
    expect(diff.servers.changed[0].tokens_delta).toBe(1000);
  });

  it("computes budget deltas correctly", () => {
    const base = makePlan();
    const head = makePlan({
      budgets: {
        ...base.budgets,
        discovery_tokens: 6000,
        total_typical: 8000,
      },
    });

    const diff = computeDiff(base, head, "main", "current");
    expect(diff.budgets.discovery_tokens.base).toBe(5000);
    expect(diff.budgets.discovery_tokens.head).toBe(6000);
    expect(diff.budgets.discovery_tokens.delta).toBe(1000);
    expect(diff.budgets.discovery_tokens.delta_pct).toBe(20);
  });

  it("detects new redundancy clusters", () => {
    const base = makePlan();
    const head = makePlan({
      analysis: {
        ...base.analysis,
        redundancy_clusters: [
          { tools: ["github:search_code", "filesystem:grep"], similarity: 0.85, token_savings_if_consolidated: 200 },
        ],
      },
    });

    const diff = computeDiff(base, head, "main", "current");
    expect(diff.analysis.redundancy_new).toHaveLength(1);
    expect(diff.analysis.redundancy_resolved).toHaveLength(0);
  });

  it("detects resolved redundancy clusters", () => {
    const base = makePlan({
      analysis: {
        redundancy_clusters: [
          { tools: ["github:search_code", "filesystem:grep"], similarity: 0.85, token_savings_if_consolidated: 200 },
        ],
        dead_capabilities: [],
        warnings: [],
      },
    });
    const head = makePlan();

    const diff = computeDiff(base, head, "main", "current");
    expect(diff.analysis.redundancy_new).toHaveLength(0);
    expect(diff.analysis.redundancy_resolved).toHaveLength(1);
  });

  it("computes waste percentage delta", () => {
    const base = makePlan();
    const head = makePlan({
      workspace: { ...base.workspace, waste_percentage: 25 },
    });

    const diff = computeDiff(base, head, "main", "current");
    expect(diff.analysis.waste_pct.base).toBe(10);
    expect(diff.analysis.waste_pct.head).toBe(25);
    expect(diff.analysis.waste_pct.delta).toBe(15);
  });

  it("computes model fit comparison", () => {
    const base = makePlan();
    const head = makePlan({
      runtime_targets: [
        {
          model: "claude-sonnet-4-6",
          context_window: 200000,
          discovery_usage_pct: 5.0,
          typical_usage_pct: 7.0,
          worst_case_usage_pct: 10.0,
          fits: true,
        },
      ],
    });

    const diff = computeDiff(base, head, "main", "current");
    expect(diff.model_fit).toHaveLength(1);
    expect(diff.model_fit[0].base_typical_pct).toBe(3.5);
    expect(diff.model_fit[0].head_typical_pct).toBe(7.0);
  });
});

describe("computeDiffWithScans", () => {
  it("enriches changed servers with tool-level detail", () => {
    const base = makePlan();
    const head = makePlan({
      workspace: {
        ...base.workspace,
        mcp_costs: {
          github: { tools: 7, tokens: 3500 },
          filesystem: { tools: 4, tokens: 2000 },
        },
      },
    });

    const baseScan = {
      servers: [
        { server: "github", tools: [{ name: "create_issue" }, { name: "search_code" }] },
        { server: "filesystem", tools: [{ name: "read_file" }] },
      ],
    };
    const headScan = {
      servers: [
        { server: "github", tools: [{ name: "create_issue" }, { name: "search_code" }, { name: "list_prs" }] },
        { server: "filesystem", tools: [{ name: "read_file" }] },
      ],
    };

    const diff = computeDiffWithScans(base, head, baseScan, headScan, "main", "current");
    expect(diff.servers.changed).toHaveLength(1);
    expect(diff.servers.changed[0].tools_added).toEqual(["list_prs"]);
    expect(diff.servers.changed[0].tools_removed).toEqual([]);
  });
});
