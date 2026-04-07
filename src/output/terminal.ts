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

  // Context Surface
  if (plan.context_surface) {
    const cs = plan.context_surface;
    lines.push("");
    lines.push(`  ${dim("── Context Surface ────────────────────────────────")}`);
    lines.push(`  Platform:       ${cs.platform}`);
    lines.push(`  Surface layers: ${cs.layers.length}`);
    lines.push(`  Total tokens:   ${fmt(cs.total_tokens)} (${cs.pressure.surface_pct}% of ${fmt(cs.pressure.context_window)})`);
    lines.push(`  Core:           ${fmt(cs.core_tokens)} tokens (always present)`);
    if (cs.conditional_tokens > 0) {
      lines.push(`  Conditional:    ${fmt(cs.conditional_tokens)} tokens (activation-dependent)`);
    }

    // Composition breakdown
    const compositionEntries = Object.entries(cs.composition)
      .sort(([, a], [, b]) => b.tokens - a.tokens);
    if (compositionEntries.length > 0) {
      for (const [type, entry] of compositionEntries) {
        const label = type.replace(/_/g, " ");
        lines.push(`    ${dim("•")} ${label}: ${fmt(entry.tokens)} tokens (${entry.percentage}%, ${entry.count} source${entry.count > 1 ? "s" : ""})`);
      }
    }
  }

  // Reference Graph
  if (plan.reference_graph) {
    const rg = plan.reference_graph;
    lines.push("");
    lines.push(`  ${dim("── Reference Graph ────────────────────────────────")}`);
    lines.push(`  Connectivity:   ${rg.connectivity_pct}% (${rg.linked} linked, ${rg.unlinked} unlinked)`);
    if (rg.broken_references > 0) {
      lines.push(`  Broken refs:    ${red(String(rg.broken_references))}`);
    }
    if (rg.unlinked_entities.length > 0) {
      for (const entity of rg.unlinked_entities.slice(0, 5)) {
        lines.push(`    ${yellow("!")} ${entity} (unlinked)`);
      }
      if (rg.unlinked_entities.length > 5) {
        lines.push(`    ${dim(`... and ${rg.unlinked_entities.length - 5} more`)}`);
      }
    }
  }

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

  // Contradictions
  if (plan.contradictions && plan.contradictions.length > 0) {
    lines.push("");
    lines.push(`  ${dim("── Contradictions ─────────────────────────────────")}`);
    for (const c of plan.contradictions) {
      const icon = c.severity === "error" ? red("X") : c.severity === "warning" ? yellow("!") : dim("i");
      const label = c.classification.replace(/_/g, " ").toUpperCase();
      lines.push(`  ${icon} ${label}: ${c.topic}`);
      lines.push(`    ${dim(c.file_a)}${c.line_a ? `:${c.line_a}` : ""}  ${dim('"')}${c.directive_a.slice(0, 60)}${c.directive_a.length > 60 ? "..." : ""}${dim('"')}`);
      lines.push(`    ${dim(c.file_b)}${c.line_b ? `:${c.line_b}` : ""}  ${dim('"')}${c.directive_b.slice(0, 60)}${c.directive_b.length > 60 ? "..." : ""}${dim('"')}`);
    }
  }

  // Staleness
  if (plan.staleness && plan.staleness.length > 0) {
    lines.push("");
    lines.push(`  ${dim("── Stale References ───────────────────────────────")}`);
    for (const s of plan.staleness) {
      const icon = s.tier === 1 ? red("!") : yellow("!");
      lines.push(`  ${icon} ${s.source}: ${s.detail}`);
    }
  }

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
