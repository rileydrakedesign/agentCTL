import chalk from "chalk";
import Table from "cli-table3";
import type { AgenticWorkspaceView, AgenticNode } from "../types.js";

/** Render the agentic workspace view to terminal. */
export function renderWorkspaceView(view: AgenticWorkspaceView): string {
  const lines: string[] = [];
  const dim = chalk.dim;
  const bold = chalk.bold;
  const green = chalk.green;

  lines.push("");
  lines.push(`  ${bold("agentctl")} v0.1.0 — agentic workspace view`);
  lines.push("");
  lines.push(`  Root: ${dim(view.root)}`);

  // ── Summary ──
  lines.push("");
  lines.push(
    `  ${dim("── Summary ────────────────────────────────────────")}`,
  );
  lines.push(
    `  Instruction files:  ${view.summary.total_instruction_files} (${fmt(view.summary.total_instruction_tokens)} tokens)`,
  );
  lines.push(
    `  Skills:             ${view.summary.total_skills} (${fmt(view.summary.total_skill_tokens)} tokens)`,
  );
  lines.push(
    `  MCP servers:        ${view.summary.total_mcp_servers} (${view.summary.total_mcp_tools} tools, ${fmt(view.summary.total_mcp_tokens)} tokens)`,
  );
  if (view.summary.deepest_instruction_depth > 0) {
    lines.push(
      `  Instruction depth:  ${view.summary.deepest_instruction_depth} level${view.summary.deepest_instruction_depth > 1 ? "s" : ""} deep`,
    );
  }

  // ── Infrastructure Tree ──
  lines.push("");
  lines.push(
    `  ${dim("── Infrastructure Tree ────────────────────────────")}`,
  );
  renderTree(view.tree, lines, "  ", true);

  // ── Instruction Files ──
  if (view.instruction_files.length > 0) {
    lines.push("");
    lines.push(
      `  ${dim("── Instruction Files ──────────────────────────────")}`,
    );

    const table = new Table({
      head: ["File", "Scope", "Tokens"],
      style: { head: ["cyan"], border: ["dim"] },
      chars: tableChars(),
    });

    for (const inst of view.instruction_files) {
      table.push([
        inst.path,
        scopeLabel(inst.scope),
        fmt(inst.token_count),
      ]);
    }
    lines.push(table.toString());
  }

  // ── Skills ──
  if (view.skills.length > 0) {
    lines.push("");
    lines.push(
      `  ${dim("── Skills ─────────────────────────────────────────")}`,
    );

    const table = new Table({
      head: ["Skill", "Tokens", "Has Instructions"],
      style: { head: ["cyan"], border: ["dim"] },
      chars: tableChars(),
    });

    for (const skill of view.skills) {
      table.push([
        skill.name,
        fmt(skill.token_count),
        skill.has_instruction ? green("yes") : dim("no"),
      ]);
    }
    lines.push(table.toString());
  }

  // ── MCP Servers ──
  if (view.mcp_servers.length > 0) {
    lines.push("");
    lines.push(
      `  ${dim("── MCP Servers ────────────────────────────────────")}`,
    );

    const table = new Table({
      head: ["Server", "Transport", "Tools", "Tokens"],
      style: { head: ["cyan"], border: ["dim"] },
      chars: tableChars(),
    });

    for (const mcp of view.mcp_servers) {
      table.push([
        mcp.name,
        mcp.transport,
        String(mcp.tool_count),
        fmt(mcp.token_cost),
      ]);
    }
    lines.push(table.toString());
  }

  lines.push("");
  return lines.join("\n");
}

/** Render the tree structure with box-drawing characters. */
function renderTree(
  nodes: AgenticNode[],
  lines: string[],
  prefix: string,
  isRoot: boolean,
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const connector = isRoot ? "" : isLast ? "└── " : "├── ";
    const childPrefix = isRoot ? prefix : prefix + (isLast ? "    " : "│   ");

    const icon = nodeIcon(node.type);
    const meta = formatMeta(node);
    lines.push(`${prefix}${connector}${icon} ${node.label}${meta}`);

    if (node.children && node.children.length > 0) {
      renderTree(node.children, lines, childPrefix, false);
    }
  }
}

function nodeIcon(type: AgenticNode["type"]): string {
  switch (type) {
    case "instruction":
      return chalk.blue("*");
    case "skill":
      return chalk.magenta("*");
    case "mcp-config":
      return chalk.yellow("*");
    case "skill-dir":
      return chalk.magenta(">");
    case "claude-dir":
      return chalk.blue(">");
    default:
      return chalk.dim("*");
  }
}

function formatMeta(node: AgenticNode): string {
  if (!node.meta) return "";
  const tokens = node.meta["tokens"];
  if (typeof tokens === "number") {
    return chalk.dim(` (${fmt(tokens)} tokens)`);
  }
  return "";
}

function scopeLabel(scope: string): string {
  switch (scope) {
    case "root":
      return chalk.green("root");
    case "nested":
      return chalk.yellow("nested");
    case "claude-dir":
      return chalk.blue(".claude");
    default:
      return scope;
  }
}

function tableChars() {
  return {
    top: "",
    "top-mid": "",
    "top-left": "",
    "top-right": "",
    bottom: "",
    "bottom-mid": "",
    "bottom-left": "",
    "bottom-right": "",
    left: "  ",
    "left-mid": "",
    mid: "\u2500",
    "mid-mid": "",
    right: "",
    "right-mid": "",
    middle: "  ",
  };
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
