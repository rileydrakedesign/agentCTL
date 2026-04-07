import { existsSync } from "node:fs";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { execSync } from "node:child_process";
import { countTokens } from "../tokens/tokenizer.js";
import type {
  PlatformName,
  PlatformProfile,
  SurfaceLayer,
  SurfaceLayerType,
  SurfaceCompositionEntry,
  ContextSurface,
  InstructionFile,
  ParsedSkill,
  ScanResult,
  RuntimeTarget,
} from "../types.js";
import type { DiscoveryResult } from "../config/discover.js";

// ── Platform Profiles ───────────────────────────────────────

const PROFILES: Record<PlatformName, PlatformProfile> = {
  "claude-code": {
    name: "claude-code",
    root_instruction_files: ["CLAUDE.md", "AGENTS.md"],
    rules_patterns: [],
    skill_directories: ["skills", ".skills", ".claude/skills"],
    config_files: [".claude/settings.json", ".claude/commands"],
    supports_hooks: true,
    supports_mdc: false,
    supports_custom_instructions: true,
  },
  cursor: {
    name: "cursor",
    root_instruction_files: [".cursorrules"],
    rules_patterns: [".cursor/rules/*.mdc"],
    skill_directories: [],
    config_files: [".cursor/mcp.json"],
    supports_hooks: false,
    supports_mdc: true,
    supports_custom_instructions: false,
  },
  windsurf: {
    name: "windsurf",
    root_instruction_files: [".windsurfrules"],
    rules_patterns: [],
    skill_directories: [],
    config_files: [],
    supports_hooks: false,
    supports_mdc: false,
    supports_custom_instructions: false,
  },
  generic: {
    name: "generic",
    root_instruction_files: ["CLAUDE.md", "AGENTS.md", ".cursorrules", ".windsurfrules"],
    rules_patterns: [".cursor/rules/*.mdc"],
    skill_directories: ["skills", ".skills", ".claude/skills"],
    config_files: [".claude/settings.json", ".cursor/mcp.json"],
    supports_hooks: true,
    supports_mdc: true,
    supports_custom_instructions: true,
  },
};

/** Get the platform profile for a given platform name. */
export function getPlatformProfile(name: PlatformName): PlatformProfile {
  return PROFILES[name];
}

/** Build a context surface model for the given project. */
export function buildContextSurface(
  platform: PlatformName,
  root: string,
  instructionFiles: InstructionFile[],
  parsedSkills: ParsedSkill[],
  scan: ScanResult,
  discovery: DiscoveryResult,
  runtimeTarget?: RuntimeTarget,
): ContextSurface {
  const profile = PROFILES[platform];
  const layers: SurfaceLayer[] = [];

  // Root instruction files
  for (const file of instructionFiles) {
    if (file.scope === "root") {
      layers.push({
        layer_type: "root_instruction",
        source_path: file.path,
        token_count: file.token_count,
        platform: profile.name,
        always_present: true,
      });
    }
  }

  // Parent instruction files (walk up from root to git root)
  const parentInstructions = discoverParentInstructions(root, profile);
  for (const layer of parentInstructions) {
    layers.push(layer);
  }

  // Nested instruction files (not root, not parent)
  for (const file of instructionFiles) {
    if (file.scope === "nested" || file.scope === "claude-dir") {
      layers.push({
        layer_type: "parent_instruction",
        source_path: file.path,
        token_count: file.token_count,
        platform: profile.name,
        always_present: file.scope === "claude-dir",
      });
    }
  }

  // MCP tool definitions
  for (const server of scan.servers) {
    if (server.status !== "ok") continue;
    const serverTokens = server.tools.reduce(
      (sum, t) => sum + t.token_estimate.total,
      0,
    );
    if (serverTokens > 0) {
      layers.push({
        layer_type: "mcp_tool_definitions",
        source_path: `mcp:${server.server}`,
        token_count: serverTokens,
        platform: profile.name,
        always_present: true,
      });
    }
  }

  // Skills
  for (const skill of parsedSkills) {
    layers.push({
      layer_type: "skill",
      source_path: skill.path,
      token_count: skill.token_count,
      platform: profile.name,
      always_present: false,
      activation_condition: "on-demand invocation",
    });
  }

  // Platform-specific rules files
  if (profile.supports_mdc) {
    const mdcFiles = discoverMdcFiles(root);
    for (const mdc of mdcFiles) {
      layers.push(mdc);
    }
  }

  // Platform-specific root rules files (e.g., .cursorrules, .windsurfrules)
  for (const rulesFile of profile.root_instruction_files) {
    // Skip instruction files we already added (CLAUDE.md, AGENTS.md)
    if (rulesFile === "CLAUDE.md" || rulesFile === "AGENTS.md") continue;
    const rulesPath = resolve(root, rulesFile);
    if (existsSync(rulesPath)) {
      const content = safeReadFile(rulesPath);
      if (content !== null) {
        layers.push({
          layer_type: "rules_file",
          source_path: rulesFile,
          token_count: countTokens(content),
          platform: profile.name,
          always_present: true,
        });
      }
    }
  }

  // Custom instructions from .claude/settings.json
  if (profile.supports_custom_instructions) {
    const customLayer = discoverCustomInstructions(root);
    if (customLayer) {
      layers.push(customLayer);
    }
  }

  // Project config (agentctl.yaml)
  const agentctlConfig = resolve(root, "agentctl.yaml");
  if (existsSync(agentctlConfig)) {
    const content = safeReadFile(agentctlConfig);
    if (content !== null) {
      layers.push({
        layer_type: "project_config",
        source_path: "agentctl.yaml",
        token_count: countTokens(content),
        platform: profile.name,
        always_present: true,
      });
    }
  }

  // Compute totals
  const total_tokens = layers.reduce((sum, l) => sum + l.token_count, 0);
  const core_tokens = layers
    .filter((l) => l.always_present)
    .reduce((sum, l) => sum + l.token_count, 0);
  const conditional_tokens = total_tokens - core_tokens;

  // Compute composition
  const composition = computeComposition(layers, total_tokens);

  // Compute pressure
  const model = runtimeTarget?.model ?? "unknown";
  const context_window = runtimeTarget?.context_window ?? 200_000;
  const surface_pct =
    total_tokens > 0
      ? Math.round((total_tokens / context_window) * 1000) / 10
      : 0;

  return {
    platform,
    layers,
    total_tokens,
    core_tokens,
    conditional_tokens,
    composition,
    pressure: {
      model,
      context_window,
      surface_pct,
      remaining_tokens: context_window - total_tokens,
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────

function computeComposition(
  layers: SurfaceLayer[],
  totalTokens: number,
): Partial<Record<SurfaceLayerType, SurfaceCompositionEntry>> {
  const groups = new Map<SurfaceLayerType, { count: number; tokens: number }>();

  for (const layer of layers) {
    const existing = groups.get(layer.layer_type);
    if (existing) {
      existing.count++;
      existing.tokens += layer.token_count;
    } else {
      groups.set(layer.layer_type, { count: 1, tokens: layer.token_count });
    }
  }

  const result: Partial<Record<SurfaceLayerType, SurfaceCompositionEntry>> = {};
  for (const [type, data] of groups) {
    result[type] = {
      count: data.count,
      tokens: data.tokens,
      percentage:
        totalTokens > 0
          ? Math.round((data.tokens / totalTokens) * 1000) / 10
          : 0,
    };
  }
  return result;
}

/** Walk up from root to git root, looking for instruction files in parent directories. */
function discoverParentInstructions(
  root: string,
  profile: PlatformProfile,
): SurfaceLayer[] {
  const layers: SurfaceLayer[] = [];
  const absRoot = resolve(root);

  let gitRoot: string | null = null;
  try {
    gitRoot = execSync("git rev-parse --show-toplevel", {
      cwd: absRoot,
      encoding: "utf-8",
    }).trim();
  } catch {
    return layers;
  }

  if (!gitRoot || resolve(gitRoot) === absRoot) return layers;

  // Walk from parent of root up to git root
  let current = dirname(absRoot);
  const gitRootResolved = resolve(gitRoot);

  while (current.length >= gitRootResolved.length) {
    for (const fileName of profile.root_instruction_files) {
      // Only check .md instruction files, not platform-specific rules
      if (!fileName.toLowerCase().endsWith(".md")) continue;
      const filePath = join(current, fileName);
      if (existsSync(filePath)) {
        const content = safeReadFile(filePath);
        if (content !== null) {
          const relPath = filePath.replace(absRoot + "/", "");
          layers.push({
            layer_type: "parent_instruction",
            source_path: relPath,
            token_count: countTokens(content),
            platform: profile.name,
            always_present: true,
          });
        }
      }
    }

    if (current === gitRootResolved) break;
    current = dirname(current);
  }

  return layers;
}

/** Discover .mdc rules files in .cursor/rules/. */
function discoverMdcFiles(root: string): SurfaceLayer[] {
  const layers: SurfaceLayer[] = [];
  const rulesDir = resolve(root, ".cursor", "rules");

  if (!existsSync(rulesDir)) return layers;

  let entries;
  try {
    entries = readdirSync(rulesDir, { withFileTypes: true });
  } catch {
    return layers;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".mdc")) continue;
    const fullPath = join(rulesDir, entry.name);
    const content = safeReadFile(fullPath);
    if (content === null) continue;

    // Check if .mdc has glob patterns in front-matter (conditionally activated)
    const hasGlob = /^---[\s\S]*?globs:/m.test(content);

    layers.push({
      layer_type: "rules_file",
      source_path: `.cursor/rules/${entry.name}`,
      token_count: countTokens(content),
      platform: "cursor",
      always_present: !hasGlob,
      activation_condition: hasGlob ? "glob pattern match" : undefined,
    });
  }

  return layers;
}

/** Discover custom instructions from .claude/settings.json. */
function discoverCustomInstructions(root: string): SurfaceLayer | null {
  const settingsPath = resolve(root, ".claude", "settings.json");
  if (!existsSync(settingsPath)) return null;

  const content = safeReadFile(settingsPath);
  if (!content) return null;

  try {
    const settings = JSON.parse(content) as Record<string, unknown>;
    const customInstructions = settings["customInstructions"];
    if (typeof customInstructions === "string" && customInstructions.length > 0) {
      return {
        layer_type: "custom_instructions",
        source_path: ".claude/settings.json",
        token_count: countTokens(customInstructions),
        platform: "claude-code",
        always_present: true,
      };
    }
  } catch {
    // Invalid JSON — skip
  }

  return null;
}

function safeReadFile(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}
