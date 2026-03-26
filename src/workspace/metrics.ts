import type {
  ScanResult,
  TokenBudget,
  WorkspaceMetrics,
  RedundancyCluster,
  DeadCapability,
  McpCost,
} from "../types.js";

/** Compute workspace-level aggregation metrics. */
export function computeWorkspaceMetrics(
  scan: ScanResult,
  budgets: TokenBudget,
  redundancyClusters: RedundancyCluster[],
  deadCapabilities: DeadCapability[],
): WorkspaceMetrics {
  const okServers = scan.servers.filter((s) => s.status === "ok");

  const mcp_costs: Record<string, McpCost> = {};
  for (const server of okServers) {
    mcp_costs[server.server] = {
      tools: server.tools.length,
      tokens: server.tools.reduce((sum, t) => sum + t.token_estimate.total, 0),
    };
  }

  const tool_count = okServers.reduce((sum, s) => sum + s.tools.length, 0);

  // Waste = tokens from redundant tools + tokens from dead capabilities
  const redundantTokens = redundancyClusters.reduce(
    (sum, c) => sum + c.token_savings_if_consolidated,
    0,
  );
  const deadToolNames = new Set(
    deadCapabilities
      .filter((d) => d.tool !== "*")
      .map((d) => `${d.server}:${d.tool}`),
  );
  let deadTokens = 0;
  for (const server of okServers) {
    for (const tool of server.tools) {
      if (deadToolNames.has(`${server.server}:${tool.name}`)) {
        deadTokens += tool.token_estimate.total;
      }
    }
  }
  const waste_percentage =
    budgets.discovery_tokens > 0
      ? Math.round(
          ((redundantTokens + deadTokens) / budgets.discovery_tokens) * 100,
        )
      : 0;

  // Warnings
  const warnings: string[] = [];
  for (const server of scan.servers) {
    if (server.status === "error") {
      const diag = server.diagnostics[0];
      warnings.push(
        `${server.server} MCP: ${diag?.type ?? "error"} — ${diag?.message ?? "unknown"}`,
      );
    }
  }
  if (redundancyClusters.length > 0) {
    const pairCount = redundancyClusters.length;
    warnings.push(
      `${pairCount} tool pair${pairCount > 1 ? "s" : ""} have >80% description overlap`,
    );
  }

  return {
    mcp_count: scan.servers.length,
    tool_count,
    discovery_tokens: budgets.discovery_tokens,
    prompt_tokens: budgets.prompt_tokens,
    total_projected: budgets.total_typical,
    waste_percentage,
    mcp_costs,
    redundancy_clusters: redundancyClusters,
    warnings,
  };
}
