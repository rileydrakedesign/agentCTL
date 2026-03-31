import type {
  PlanReport,
  McpConfig,
  OptimizeAction,
  ManualFinding,
  RedundancyCluster,
} from "../types.js";

export interface ComputeActionsOptions {
  removeDead: boolean;
  consolidate: boolean;
}

export interface ComputeActionsResult {
  actions: OptimizeAction[];
  manualFindings: ManualFinding[];
}

/**
 * Compute server-level optimization actions from a PlanReport.
 * Pure function — no I/O.
 */
export function computeOptimizeActions(
  plan: PlanReport,
  config: McpConfig,
  options: ComputeActionsOptions,
): ComputeActionsResult {
  const actions: OptimizeAction[] = [];
  const manualFindings: ManualFinding[] = [];
  const removedServers = new Set<string>();
  const configServers = new Set(Object.keys(config.mcpServers));

  // ── Dead servers ─────────────────────────────────────
  if (options.removeDead) {
    // Servers that returned 0 tools (tool === "*")
    const deadServers = plan.analysis.dead_capabilities
      .filter((d) => d.tool === "*")
      .map((d) => d.server);

    // Servers that failed to scan entirely
    const failedServers = plan.diagnostics
      .filter((d) => d.type === "connectivity_failure")
      .map((d) => d.server);

    const allDeadServers = new Set([...deadServers, ...failedServers]);

    for (const server of allDeadServers) {
      if (!configServers.has(server)) continue;
      const tokens = plan.workspace.mcp_costs[server]?.tokens ?? 0;
      const isFailed = failedServers.includes(server);
      actions.push({
        type: "remove_dead_server",
        server,
        rationale: isFailed
          ? "Server failed to connect"
          : "Server returned 0 tools",
        token_savings: tokens,
      });
      removedServers.add(server);
    }
  }

  // ── Redundant servers ────────────────────────────────
  if (options.consolidate) {
    const subsetCandidates = findRedundantSubsets(
      plan.analysis.redundancy_clusters,
      plan.workspace.mcp_costs,
      configServers,
    );

    for (const candidate of subsetCandidates) {
      if (removedServers.has(candidate.server)) continue;
      actions.push({
        type: "remove_redundant_server",
        server: candidate.server,
        rationale: candidate.rationale,
        token_savings: candidate.tokenSavings,
      });
      removedServers.add(candidate.server);
    }
  }

  // ── Manual findings ──────────────────────────────────

  // Dead individual tools in servers we're NOT removing
  for (const dead of plan.analysis.dead_capabilities) {
    if (dead.tool === "*") continue;
    if (removedServers.has(dead.server)) continue;
    manualFindings.push({
      server: dead.server,
      tool: dead.tool,
      issue: "dead_tool",
      detail: dead.reason,
    });
  }

  // Partial redundancy — clusters where neither server qualifies for removal
  for (const cluster of plan.analysis.redundancy_clusters) {
    const servers = cluster.tools.map((t) => t.split(":")[0]);
    if (servers.every((s) => removedServers.has(s))) continue;
    if (servers.some((s) => removedServers.has(s))) continue;
    // Neither server is being removed — this is a partial redundancy
    manualFindings.push({
      server: servers.join(", "),
      tool: cluster.tools.join(" <-> "),
      issue: "partial_redundancy",
      detail: `${Math.round(cluster.similarity * 100)}% similar — ${cluster.token_savings_if_consolidated} tokens saveable by consolidating`,
    });
  }

  return { actions, manualFindings };
}

// ── Helpers ────────────────────────────────────────────

interface SubsetCandidate {
  server: string;
  rationale: string;
  tokenSavings: number;
}

/**
 * Find servers whose tools are ALL redundant with another server's tools.
 * These are candidates for removal since the other server covers everything.
 */
function findRedundantSubsets(
  clusters: RedundancyCluster[],
  mcpCosts: Record<string, { tools: number; tokens: number }>,
  configServers: Set<string>,
): SubsetCandidate[] {
  // Build a map: for each server pair, track which tools are redundant
  const pairMap = new Map<string, { toolsA: Set<string>; toolsB: Set<string> }>();

  for (const cluster of clusters) {
    const [keyA, keyB] = cluster.tools;
    const serverA = keyA.split(":")[0];
    const serverB = keyB.split(":")[0];
    if (serverA === serverB) continue;

    // Canonical pair key (sorted)
    const [first, second] = [serverA, serverB].sort();
    const pairKey = `${first}|${second}`;

    if (!pairMap.has(pairKey)) {
      pairMap.set(pairKey, { toolsA: new Set(), toolsB: new Set() });
    }
    const pair = pairMap.get(pairKey)!;
    // Track which tools from each server participate in redundancy
    if (serverA === first) {
      pair.toolsA.add(keyA);
      pair.toolsB.add(keyB);
    } else {
      pair.toolsA.add(keyB);
      pair.toolsB.add(keyA);
    }
  }

  const candidates: SubsetCandidate[] = [];
  const alreadyTargeted = new Set<string>();

  for (const [pairKey, pair] of pairMap) {
    const [serverA, serverB] = pairKey.split("|");
    if (!configServers.has(serverA) || !configServers.has(serverB)) continue;

    const totalToolsA = mcpCosts[serverA]?.tools ?? 0;
    const totalToolsB = mcpCosts[serverB]?.tools ?? 0;
    const redundantCountA = pair.toolsA.size;
    const redundantCountB = pair.toolsB.size;

    const aIsSubset = totalToolsA > 0 && redundantCountA >= totalToolsA;
    const bIsSubset = totalToolsB > 0 && redundantCountB >= totalToolsB;

    let toRemove: string | null = null;
    let toKeep: string | null = null;

    if (aIsSubset && bIsSubset) {
      // Both are subsets — remove the one with fewer total tools, or alphabetical tiebreak
      if (totalToolsA < totalToolsB) {
        toRemove = serverA;
        toKeep = serverB;
      } else if (totalToolsB < totalToolsA) {
        toRemove = serverB;
        toKeep = serverA;
      } else {
        // Equal size — alphabetical: remove the later one
        toRemove = serverB;
        toKeep = serverA;
      }
    } else if (aIsSubset) {
      toRemove = serverA;
      toKeep = serverB;
    } else if (bIsSubset) {
      toRemove = serverB;
      toKeep = serverA;
    }

    if (toRemove && toKeep && !alreadyTargeted.has(toRemove)) {
      const avgSimilarity = computeAvgSimilarity(clusters, toRemove, toKeep);
      candidates.push({
        server: toRemove,
        rationale: `All ${mcpCosts[toRemove]?.tools ?? 0} tools redundant with ${toKeep} (avg ${Math.round(avgSimilarity * 100)}% similarity)`,
        tokenSavings: mcpCosts[toRemove]?.tokens ?? 0,
      });
      alreadyTargeted.add(toRemove);
    }
  }

  return candidates;
}

function computeAvgSimilarity(
  clusters: RedundancyCluster[],
  serverA: string,
  serverB: string,
): number {
  const relevant = clusters.filter((c) => {
    const servers = c.tools.map((t) => t.split(":")[0]);
    return servers.includes(serverA) && servers.includes(serverB);
  });
  if (relevant.length === 0) return 0;
  return relevant.reduce((sum, c) => sum + c.similarity, 0) / relevant.length;
}
