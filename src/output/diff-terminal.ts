import chalk from "chalk";
import Table from "cli-table3";
import type { DiffReport, NumericDelta } from "../types.js";

/** Render a diff report to the terminal. */
export function renderDiffReport(diff: DiffReport): string {
  const lines: string[] = [];
  const dim = chalk.dim;
  const bold = chalk.bold;
  const green = chalk.green;
  const red = chalk.red;
  const cyan = chalk.cyan;

  lines.push("");
  lines.push(`  ${bold("agentctl diff")} — ${diff.base_ref} → ${diff.head_ref}`);

  // ── Servers ──────────────────────────────────────────
  const hasServerChanges =
    diff.servers.added.length > 0 ||
    diff.servers.removed.length > 0 ||
    diff.servers.changed.length > 0;

  if (hasServerChanges) {
    lines.push("");
    lines.push(`  ${dim("── Servers ────────────────────────────────────────")}`);

    for (const s of diff.servers.added) {
      lines.push(
        `  ${green("+")} ${bold(s.name)}  ${dim(`(added, ${s.tools} tools, ${fmt(s.tokens)} tokens)`)}`,
      );
    }
    for (const s of diff.servers.removed) {
      lines.push(
        `  ${red("-")} ${bold(s.name)}  ${dim(`(removed, -${s.tools} tools, -${fmt(s.tokens)} tokens)`)}`,
      );
    }
    for (const s of diff.servers.changed) {
      const parts: string[] = [];
      if (s.tools_delta !== 0) {
        parts.push(`${signedNum(s.tools_delta)} tools`);
      }
      if (s.tokens_delta !== 0) {
        parts.push(`${signedFmt(s.tokens_delta)} tokens`);
      }
      if (parts.length > 0) {
        lines.push(
          `  ${cyan("~")} ${bold(s.name)}  ${dim(`(${parts.join(", ")})`)}`,
        );
      }
      if (s.tools_added.length > 0) {
        for (const t of s.tools_added) {
          lines.push(`      ${green("+")} ${t}`);
        }
      }
      if (s.tools_removed.length > 0) {
        for (const t of s.tools_removed) {
          lines.push(`      ${red("-")} ${t}`);
        }
      }
    }
  } else {
    lines.push("");
    lines.push(`  ${dim("── Servers ────────────────────────────────────────")}`);
    lines.push(`  No server changes`);
  }

  // ── Token Budget ─────────────────────────────────────
  lines.push("");
  lines.push(`  ${dim("── Token Budget ───────────────────────────────────")}`);

  const table = new Table({
    head: ["", "base", "head", "delta"],
    style: { head: ["cyan"], border: ["dim"] },
    chars: {
      top: "", "top-mid": "", "top-left": "", "top-right": "",
      bottom: "", "bottom-mid": "", "bottom-left": "", "bottom-right": "",
      left: "  ", "left-mid": "", mid: "─", "mid-mid": "",
      right: "", "right-mid": "", middle: "  ",
    },
  });

  table.push(
    budgetRow("Discovery:", diff.budgets.discovery_tokens),
    budgetRow("Prompts:", diff.budgets.prompt_tokens),
    budgetRow("Total (typical):", diff.budgets.total_typical),
    budgetRow("Total (worst):", diff.budgets.total_worst_case),
  );

  lines.push(table.toString());

  // ── Analysis ─────────────────────────────────────────
  const hasAnalysisChanges =
    diff.analysis.redundancy_new.length > 0 ||
    diff.analysis.redundancy_resolved.length > 0 ||
    diff.analysis.waste_pct.delta !== 0;

  if (hasAnalysisChanges) {
    lines.push("");
    lines.push(`  ${dim("── Analysis ───────────────────────────────────────")}`);

    for (const c of diff.analysis.redundancy_new) {
      lines.push(
        `  ${red("New redundancy:")} ${c.tools.join(" ↔ ")} (${Math.round(c.similarity * 100)}%)`,
      );
    }
    for (const c of diff.analysis.redundancy_resolved) {
      lines.push(
        `  ${green("Resolved:")} ${c.tools.join(" ↔ ")}`,
      );
    }

    const wasteDelta = diff.analysis.waste_pct;
    if (wasteDelta.delta !== 0) {
      const color = wasteDelta.delta < 0 ? green : red;
      lines.push(
        `  Waste: ${wasteDelta.base}% → ${wasteDelta.head}% (${color(signedNum(wasteDelta.delta) + "%")})`,
      );
    }
  }

  // ── Model Fit ────────────────────────────────────────
  if (diff.model_fit.length > 0) {
    lines.push("");
    lines.push(`  ${dim("── Model Fit ──────────────────────────────────────")}`);

    for (const m of diff.model_fit) {
      const arrow = m.head_typical_pct > m.base_typical_pct ? red("↑") : green("↓");
      const fitIcon = m.head_fits ? green("✓") : red("✗");
      lines.push(
        `  ${m.model}: ${m.base_typical_pct}% → ${m.head_typical_pct}% ${m.base_typical_pct !== m.head_typical_pct ? arrow : ""} ${fitIcon}`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

// ── Formatting helpers ──────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function signedNum(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function signedFmt(n: number): string {
  return n > 0 ? `+${fmt(n)}` : fmt(n);
}

function budgetRow(
  label: string,
  d: NumericDelta,
): [string, string, string, string] {
  const color = d.delta < 0 ? chalk.green : d.delta > 0 ? chalk.red : chalk.dim;
  const deltaStr = d.delta === 0
    ? chalk.dim("—")
    : color(`${signedFmt(d.delta)} (${signedNum(d.delta_pct)}%)`);
  return [label, fmt(d.base), fmt(d.head), deltaStr];
}
