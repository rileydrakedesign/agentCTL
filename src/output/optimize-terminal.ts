import chalk from "chalk";
import type { OptimizeResult } from "../types.js";

/** Render the optimize result to terminal. */
export function renderOptimizeResult(
  result: OptimizeResult,
  dryRun: boolean,
): string {
  const lines: string[] = [];
  const dim = chalk.dim;
  const bold = chalk.bold;
  const red = chalk.red;
  const green = chalk.green;
  const yellow = chalk.yellow;
  const cyan = chalk.cyan;

  lines.push("");
  lines.push(
    `  ${bold("agentctl optimize")} — ${dryRun ? yellow("DRY RUN") : green("APPLIED")}`,
  );
  lines.push(`  Config: ${result.config_path}`);

  // No work to do
  if (result.actions.length === 0 && result.manual_findings.length === 0) {
    lines.push("");
    lines.push(`  ${green("+")} No optimizations needed — config is clean.`);
    lines.push("");
    return lines.join("\n");
  }

  // Actions
  if (result.actions.length > 0) {
    lines.push("");
    lines.push(
      `  ${dim("── Actions " + (dryRun ? "(planned)" : "(applied)") + " ────────────────────────────────")}`,
    );
    for (const action of result.actions) {
      const savings =
        action.token_savings > 0
          ? ` (${fmt(action.token_savings)} tokens saved)`
          : "";
      lines.push(`  ${red("-")} ${bold(action.server)}${savings}`);
      lines.push(`    ${dim(action.rationale)}`);
    }
  }

  // Manual findings
  if (result.manual_findings.length > 0) {
    lines.push("");
    lines.push(
      `  ${dim("── Manual Review Required ─────────────────────────")}`,
    );
    for (const finding of result.manual_findings) {
      const label =
        finding.tool === "*"
          ? finding.server
          : `${finding.server}:${finding.tool}`;
      lines.push(`  ${yellow("!")} ${label}`);
      lines.push(`    ${dim(finding.detail)}`);
    }
  }

  // Summary
  lines.push("");
  lines.push(`  ${dim("── Summary ────────────────────────────────────────")}`);

  const parts: string[] = [];
  if (result.actions.length > 0) {
    parts.push(
      `${result.actions.length} server${result.actions.length > 1 ? "s" : ""} removed`,
    );
  }
  if (result.total_token_savings > 0) {
    parts.push(`${fmt(result.total_token_savings)} tokens saved`);
  }
  if (result.manual_findings.length > 0) {
    parts.push(
      `${result.manual_findings.length} issue${result.manual_findings.length > 1 ? "s" : ""} require manual review`,
    );
  }
  lines.push(`  ${parts.join(" · ")}`);

  // Server diff
  if (result.actions.length > 0) {
    const removed = new Set(result.actions.map((a) => a.server));
    lines.push("");
    lines.push(
      `  ${dim("── Servers ────────────────────────────────────────")}`,
    );
    for (const server of result.servers_before) {
      if (removed.has(server)) {
        lines.push(`  ${red("-")} ${red(server)}`);
      } else {
        lines.push(`    ${server}`);
      }
    }
  }

  // Footer
  if (dryRun && result.actions.length > 0) {
    lines.push("");
    lines.push(
      `  Run ${cyan("agentctl optimize --apply")} to write changes.`,
    );
  }
  if (result.backup_path) {
    lines.push(`  Backup saved to ${dim(result.backup_path)}`);
  }

  lines.push("");
  return lines.join("\n");
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
