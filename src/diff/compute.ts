import type {
  PlanReport,
  DiffReport,
  NumericDelta,
  ServerDelta,
  RedundancyCluster,
} from "../types.js";

/** Compute a structured diff between two plan reports. */
export function computeDiff(
  basePlan: PlanReport,
  headPlan: PlanReport,
  baseRef: string,
  headRef: string,
): DiffReport {
  return {
    version: 1,
    timestamp: new Date().toISOString(),
    base_ref: baseRef,
    head_ref: headRef,
    servers: computeServerDiff(basePlan, headPlan),
    budgets: computeBudgetDiff(basePlan, headPlan),
    analysis: computeAnalysisDiff(basePlan, headPlan),
    model_fit: computeModelFitDiff(basePlan, headPlan),
  };
}

// ── Helpers ─────────────────────────────────────────────

function delta(base: number, head: number): NumericDelta {
  const d = head - base;
  const pct = base === 0 ? (head === 0 ? 0 : 100) : (d / base) * 100;
  return {
    base,
    head,
    delta: d,
    delta_pct: Math.round(pct * 10) / 10,
  };
}

// ── Server diff ─────────────────────────────────────────

function computeServerDiff(basePlan: PlanReport, headPlan: PlanReport) {
  const baseServers = new Map(
    basePlan.workspace.mcp_costs
      ? Object.entries(basePlan.workspace.mcp_costs)
      : [],
  );
  const headServers = new Map(
    headPlan.workspace.mcp_costs
      ? Object.entries(headPlan.workspace.mcp_costs)
      : [],
  );

  const baseToolsByServer = toolsByServer(basePlan);
  const headToolsByServer = toolsByServer(headPlan);

  const added: Array<{ name: string; tools: number; tokens: number }> = [];
  const removed: Array<{ name: string; tools: number; tokens: number }> = [];
  const changed: ServerDelta[] = [];

  // Added servers
  for (const [name, cost] of headServers) {
    if (!baseServers.has(name)) {
      added.push({ name, tools: cost.tools, tokens: cost.tokens });
    }
  }

  // Removed servers
  for (const [name, cost] of baseServers) {
    if (!headServers.has(name)) {
      removed.push({ name, tools: cost.tools, tokens: cost.tokens });
    }
  }

  // Changed servers
  for (const [name, headCost] of headServers) {
    const baseCost = baseServers.get(name);
    if (!baseCost) continue;

    const baseTools = new Set(baseToolsByServer.get(name) ?? []);
    const headTools = new Set(headToolsByServer.get(name) ?? []);

    const tools_added = [...headTools].filter((t) => !baseTools.has(t));
    const tools_removed = [...baseTools].filter((t) => !headTools.has(t));

    if (tools_added.length > 0 || tools_removed.length > 0 || baseCost.tokens !== headCost.tokens) {
      changed.push({
        name,
        tools_delta: headCost.tools - baseCost.tools,
        tokens_delta: headCost.tokens - baseCost.tokens,
        tools_added,
        tools_removed,
      });
    }
  }

  return { added, removed, changed };
}

function toolsByServer(plan: PlanReport): Map<string, string[]> {
  const result = new Map<string, string[]>();
  // Reconstruct from the scan data embedded in the plan
  // The plan doesn't store raw scan servers, but we can infer tool names
  // from the analysis and workspace data. For accurate tool-level diff,
  // we look at the plan's underlying structure.
  //
  // Since PlanReport doesn't carry per-server tool names directly,
  // we need the ScanResult. For now, return empty — the caller
  // will provide scan data when available.
  return result;
}

// ── Budget diff ─────────────────────────────────────────

function computeBudgetDiff(basePlan: PlanReport, headPlan: PlanReport) {
  return {
    discovery_tokens: delta(
      basePlan.budgets.discovery_tokens,
      headPlan.budgets.discovery_tokens,
    ),
    prompt_tokens: delta(
      basePlan.budgets.prompt_tokens,
      headPlan.budgets.prompt_tokens,
    ),
    total_typical: delta(
      basePlan.budgets.total_typical,
      headPlan.budgets.total_typical,
    ),
    total_worst_case: delta(
      basePlan.budgets.total_worst_case,
      headPlan.budgets.total_worst_case,
    ),
  };
}

// ── Analysis diff ───────────────────────────────────────

function computeAnalysisDiff(basePlan: PlanReport, headPlan: PlanReport) {
  const baseClusterKeys = new Set(
    basePlan.analysis.redundancy_clusters.map(clusterKey),
  );
  const headClusterKeys = new Set(
    headPlan.analysis.redundancy_clusters.map(clusterKey),
  );

  const redundancy_new = headPlan.analysis.redundancy_clusters.filter(
    (c) => !baseClusterKeys.has(clusterKey(c)),
  );
  const redundancy_resolved = basePlan.analysis.redundancy_clusters.filter(
    (c) => !headClusterKeys.has(clusterKey(c)),
  );

  return {
    redundancy_new,
    redundancy_resolved,
    waste_pct: delta(
      basePlan.workspace.waste_percentage,
      headPlan.workspace.waste_percentage,
    ),
  };
}

function clusterKey(cluster: RedundancyCluster): string {
  return [...cluster.tools].sort().join("|");
}

// ── Model fit diff ──────────────────────────────────────

function computeModelFitDiff(basePlan: PlanReport, headPlan: PlanReport) {
  const baseByModel = new Map(
    basePlan.runtime_targets.map((t) => [t.model, t]),
  );

  return headPlan.runtime_targets.map((headTarget) => {
    const baseTarget = baseByModel.get(headTarget.model);
    return {
      model: headTarget.model,
      base_typical_pct: baseTarget?.typical_usage_pct ?? 0,
      head_typical_pct: headTarget.typical_usage_pct,
      base_fits: baseTarget?.fits ?? true,
      head_fits: headTarget.fits,
    };
  });
}

// ── Enhanced compute with scan data ─────────────────────

/** Compute diff with access to scan results for tool-level detail. */
export function computeDiffWithScans(
  basePlan: PlanReport,
  headPlan: PlanReport,
  baseScan: { servers: Array<{ server: string; tools: Array<{ name: string }> }> },
  headScan: { servers: Array<{ server: string; tools: Array<{ name: string }> }> },
  baseRef: string,
  headRef: string,
): DiffReport {
  const diff = computeDiff(basePlan, headPlan, baseRef, headRef);

  // Enhance changed servers with accurate tool-level data from scans
  const baseToolMap = new Map<string, Set<string>>();
  for (const s of baseScan.servers) {
    baseToolMap.set(s.server, new Set(s.tools.map((t) => t.name)));
  }
  const headToolMap = new Map<string, Set<string>>();
  for (const s of headScan.servers) {
    headToolMap.set(s.server, new Set(s.tools.map((t) => t.name)));
  }

  diff.servers.changed = diff.servers.changed.map((ch) => {
    const baseTools = baseToolMap.get(ch.name) ?? new Set();
    const headTools = headToolMap.get(ch.name) ?? new Set();
    return {
      ...ch,
      tools_added: [...headTools].filter((t) => !baseTools.has(t)),
      tools_removed: [...baseTools].filter((t) => !headTools.has(t)),
    };
  });

  return diff;
}
