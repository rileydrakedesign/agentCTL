import { resolve, relative, dirname, basename } from "node:path";
import type {
  AgenticWorkspaceView,
  AgenticNode,
  InstructionFile,
  SkillEntry,
  McpEntry,
  ScanResult,
  ParsedSkill,
} from "../types.js";
import type { DiscoveryResult } from "../config/discover.js";

/**
 * Build the full agentic workspace view — maps the infrastructure
 * that defines how an AI agent operates in this project.
 *
 * This includes:
 * - Instruction files (CLAUDE.md, AGENTS.md, nested .md files)
 * - Skill directories and parsed skills
 * - MCP server registrations and their tool/token costs
 * - A structural tree showing how these pieces are organized
 */
export function buildAgenticWorkspaceView(
  root: string,
  instructionFiles: InstructionFile[],
  parsedSkills: ParsedSkill[],
  scan: ScanResult,
  discovery: DiscoveryResult,
): AgenticWorkspaceView {
  const skills = buildSkillEntries(parsedSkills, instructionFiles);
  const mcpServers = buildMcpEntries(scan, discovery);
  const tree = buildTree(root, instructionFiles, parsedSkills, discovery);

  const totalSkillTokens = skills.reduce((s, sk) => s + sk.token_count, 0);
  const totalMcpTools = mcpServers.reduce((s, m) => s + m.tool_count, 0);
  const totalMcpTokens = mcpServers.reduce((s, m) => s + m.token_cost, 0);
  const totalInstructionTokens = instructionFiles.reduce(
    (s, f) => s + f.token_count,
    0,
  );
  const deepest = instructionFiles.reduce(
    (max, f) => Math.max(max, f.depth),
    0,
  );

  return {
    root,
    instruction_files: instructionFiles,
    skills,
    mcp_servers: mcpServers,
    tree,
    summary: {
      total_instruction_files: instructionFiles.length,
      total_instruction_tokens: totalInstructionTokens,
      total_skills: skills.length,
      total_skill_tokens: totalSkillTokens,
      total_mcp_servers: mcpServers.length,
      total_mcp_tools: totalMcpTools,
      total_mcp_tokens: totalMcpTokens,
      deepest_instruction_depth: deepest,
    },
  };
}

/** Build skill entries with instruction file cross-reference. */
function buildSkillEntries(
  parsedSkills: ParsedSkill[],
  instructionFiles: InstructionFile[],
): SkillEntry[] {
  return parsedSkills.map((skill) => {
    // Check if there's an instruction file adjacent to this skill
    const skillDir = dirname(skill.path);
    const hasInstruction = instructionFiles.some((f) => {
      const instrDir = dirname(f.path);
      return instrDir === relative(process.cwd(), skillDir);
    });

    return {
      name: skill.name,
      path: skill.path,
      token_count: skill.token_count,
      has_instruction: hasInstruction,
    };
  });
}

/** Build MCP server entries from scan + discovery results. */
function buildMcpEntries(
  scan: ScanResult,
  discovery: DiscoveryResult,
): McpEntry[] {
  return scan.servers.map((server) => {
    // Determine which config source this server came from
    const source = discovery.config_sources[discovery.config_sources.length - 1] ?? "unknown";

    return {
      name: server.server,
      source,
      transport: server.transport,
      tool_count: server.tools.length,
      token_cost: server.tools.reduce(
        (sum, t) => sum + t.token_estimate.total,
        0,
      ),
    };
  });
}

/** Build a structural tree representing the agentic infrastructure. */
function buildTree(
  root: string,
  instructionFiles: InstructionFile[],
  parsedSkills: ParsedSkill[],
  discovery: DiscoveryResult,
): AgenticNode[] {
  const nodes: AgenticNode[] = [];

  // Root instruction files
  const rootInstructions = instructionFiles.filter((f) => f.scope === "root");
  for (const inst of rootInstructions) {
    nodes.push({
      type: "instruction",
      path: inst.path,
      label: basename(inst.path),
      meta: { tokens: inst.token_count, scope: inst.scope },
    });
  }

  // .claude/ directory
  const claudeFiles = instructionFiles.filter((f) => f.scope === "claude-dir");
  if (claudeFiles.length > 0) {
    const claudeNode: AgenticNode = {
      type: "claude-dir",
      path: ".claude/",
      label: ".claude/",
      children: claudeFiles.map((f) => ({
        type: "instruction" as const,
        path: f.path,
        label: basename(f.path),
        meta: { tokens: f.token_count, scope: f.scope },
      })),
    };
    nodes.push(claudeNode);
  }

  // Skill directories
  for (const skillDir of discovery.skill_dirs) {
    const dirSkills = parsedSkills.filter((s) =>
      s.path.startsWith(resolve(skillDir)),
    );

    if (dirSkills.length === 0) continue;

    const skillDirNode: AgenticNode = {
      type: "skill-dir",
      path: skillDir,
      label: `${skillDir}/`,
      children: dirSkills.map((s) => ({
        type: "skill" as const,
        path: s.path,
        label: s.name,
        meta: { tokens: s.token_count },
      })),
    };
    nodes.push(skillDirNode);
  }

  // Nested instruction files (not root, not .claude/)
  const nestedInstructions = instructionFiles.filter(
    (f) => f.scope === "nested",
  );
  if (nestedInstructions.length > 0) {
    // Group by parent directory
    const byDir = new Map<string, InstructionFile[]>();
    for (const inst of nestedInstructions) {
      const dir = dirname(inst.path);
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir)!.push(inst);
    }

    for (const [, files] of byDir) {
      for (const f of files) {
        nodes.push({
          type: "instruction",
          path: f.path,
          label: f.path,
          meta: { tokens: f.token_count, depth: f.depth },
        });
      }
    }
  }

  // MCP config sources
  for (const source of discovery.config_sources) {
    nodes.push({
      type: "mcp-config",
      path: source,
      label: basename(source),
      meta: { source },
    });
  }

  return nodes;
}
