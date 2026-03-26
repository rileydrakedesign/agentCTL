import chalk from "chalk";
import Table from "cli-table3";
import type { PlanReport } from "../types.js";

/** Render the plan report to terminal. */
export function renderPlanReport(plan: PlanReport): string {
  const lines: string[] = [];
  const dim = chalk.dim;
  const bold = chalk.bold;
  const yellow = chalk.yellow;
  const red = chalk.red;
  const cyan = chalk.cyan;

  lines.push("");
  lines.push(`  ${bold("agentctl")} v0.1.0 — capability intelligence`);
  lines.push("");
  lines.push(`  Project: ${bold(plan.project)}`);
  lines.push(`  Config:  ${plan.inputs.config_path}`);
  lines.push(`  Status:  ${statusColor(plan.status)}`);
  lines.push(
    `  Models:  ${plan.runtime_targets.map((t) => `${t.model} (${fmt(t.context_window)})`).join(", ")}`,
  );

  // Discovery
  lines.push("");
  lines.push(`  ${dim("── Discovery ──────────────────────────────────────")}`);
  const okCount = plan.capabilities.mcp_servers - plan.diagnostics.filter((d) => d.type !== "parse_error").length;
  lines.push(
    `  MCP servers:    ${plan.capabilities.mcp_servers} (${okCount} ok${plan.capabilities.mcp_servers - okCount > 0 ? `, ${plan.capabilities.mcp_servers - okCount} failed` : ""})`,
  );
  lines.push(`  Tools found:    ${plan.capabilities.mcp_tools}`);
  lines.push(`  Skills found:   ${plan.capabilities.skills}`);
  lines.push(`  Prompt files:   ${plan.inputs.prompt_files.length}`);

  // Token Budget table
  lines.push("");
  lines.push(`  ${dim("── Token Budget ───────────────────────────────────")}`);

  const table = new Table({
    head: ["", ...plan.runtime_targets.map((t) => t.model)],
    style: { head: ["cyan"], border: ["dim"] },
    chars: {
      top: "", "top-mid": "", "top-left": "", "top-right": "",
      bottom: "", "bottom-mid": "", "bottom-left": "", "bottom-right": "",
      left: "  ", "left-mid": "", mid: "─", "mid-mid": "",
      right: "", "right-mid": "", middle: "  ",
    },
  });

  table.push(
    ["Discovery:", ...plan.runtime_targets.map((t) =>
      `${fmt(plan.budgets.discovery_tokens)} (${t.discovery_usage_pct}%)`,
    )],
    ["Prompts:", ...plan.runtime_targets.map(() =>
      `${fmt(plan.budgets.prompt_tokens)}`,
    )],
    ["Typical act.:", ...plan.runtime_targets.map((t) =>
      `${fmt(plan.budgets.typical_activation_tokens)} (${Math.round((plan.budgets.typical_activation_tokens / t.context_window) * 100)}%)`,
    )],
    ["Total (typical):", ...plan.runtime_targets.map((t) =>
      `${fmt(plan.budgets.total_typical)} (${t.typical_usage_pct}%)`,
    )],
    ["Remaining:", ...plan.runtime_targets.map((t) =>
      `${fmt(t.context_window - plan.budgets.total_typical)}`,
    )],
  );

  lines.push(table.toString());

  // Workspace
  lines.push("");
  lines.push(`  ${dim("── Workspace ──────────────────────────────────────")}`);

  const largest = Object.entries(plan.workspace.mcp_costs).sort(
    (a, b) => b[1].tokens - a[1].tokens,
  )[0];
  if (largest) {
    lines.push(
      `  Largest MCP:    ${largest[0]} (${fmt(largest[1].tokens)} tokens, ${largest[1].tools} tools)`,
    );
  }
  lines.push(
    `  Redundancy:     ${plan.analysis.redundancy_clusters.length} clusters`,
  );
  lines.push(`  Est. waste:     ${plan.workspace.waste_percentage}%`);

  // Warnings
  if (plan.workspace.warnings.length > 0 || plan.analysis.warnings.length > 0) {
    lines.push("");
    lines.push(`  ${dim("── Warnings ───────────────────────────────────────")}`);
    for (const w of [...plan.workspace.warnings, ...plan.analysis.warnings.map((w) => w.message)]) {
      const icon = w.includes("error") ? red("!") : yellow("!");
      lines.push(`  ${icon} ${w}`);
    }
  }

  // Recommendations
  if (plan.recommendations.length > 0) {
    lines.push("");
    lines.push(`  ${dim("── Recommendations ────────────────────────────────")}`);
    for (const rec of plan.recommendations) {
      lines.push(`  ${cyan("→")} ${rec}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function statusColor(status: string): string {
  switch (status) {
    case "success":
      return chalk.green(status.toUpperCase());
    case "partial":
      return chalk.yellow(status.toUpperCase());
    case "failed":
      return chalk.red(status.toUpperCase());
    default:
      return status;
  }
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
