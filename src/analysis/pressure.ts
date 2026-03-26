import type {
  ScanResult,
  TokenBudget,
  RuntimeTarget,
  ContextWarning,
} from "../types.js";

/** Generate context pressure warnings based on token budgets. */
export function detectPressure(
  scan: ScanResult,
  budgets: TokenBudget,
  targets: RuntimeTarget[],
): ContextWarning[] {
  const warnings: ContextWarning[] = [];

  // Discovery tokens > 50% of smallest context window
  const smallest = Math.min(...targets.map((t) => t.context_window));
  const discoveryPct = (budgets.discovery_tokens / smallest) * 100;
  if (discoveryPct > 50) {
    warnings.push({
      message: `Discovery tokens (${fmt(budgets.discovery_tokens)}) use ${Math.round(discoveryPct)}% of smallest context window (${fmt(smallest)})`,
      severity: "error",
    });
  }

  // Single MCP server contributing > 40% of total token budget
  for (const server of scan.servers) {
    if (server.status !== "ok") continue;
    const serverTokens = server.tools.reduce(
      (sum, t) => sum + t.token_estimate.total,
      0,
    );
    const pct = (serverTokens / budgets.discovery_tokens) * 100;
    if (pct > 40 && budgets.discovery_tokens > 0) {
      warnings.push({
        message: `${server.server} MCP contributes ${Math.round(pct)}% of discovery tokens (${fmt(serverTokens)})`,
        severity: "warning",
      });
    }
  }

  // Total tool count > 50
  const totalTools = scan.servers.reduce((sum, s) => sum + s.tools.length, 0);
  if (totalTools > 50) {
    warnings.push({
      message: `${totalTools} tools discovered — high context overhead likely`,
      severity: "warning",
    });
  }

  return warnings;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
