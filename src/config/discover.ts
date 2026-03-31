import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { homedir } from "node:os";
import type { McpConfig, McpServerConfig, InstructionFile } from "../types.js";
import { mcpConfigSchema, mcpServerConfigSchema } from "./schemas.js";
import { countTokens } from "../tokens/tokenizer.js";

/** Paths to check for .mcp.json-style project config. */
const PROJECT_CONFIG_PATHS = [
  ".mcp.json",
];

/** Path to Claude Code's user config. */
const CLAUDE_CODE_CONFIG = join(homedir(), ".claude.json");

/** Path to Claude Desktop config. */
const CLAUDE_DESKTOP_CONFIG = join(homedir(), ".claude", "claude_desktop_config.json");

export interface DiscoveryResult {
  config: McpConfig;
  config_path: string;
  config_sources: string[];
  prompt_files: string[];
  skill_dirs: string[];
}

/** Find and parse MCP config, prompt files, and skill directories. */
export async function discoverInputs(
  explicitConfigPath?: string,
): Promise<DiscoveryResult> {
  const prompt_files = findPromptFiles();
  const skill_dirs = findSkillDirs();

  // If an explicit config is given, use only that
  if (explicitConfigPath) {
    const resolved = resolve(explicitConfigPath);
    if (!existsSync(resolved)) {
      throw new Error(`Config file not found: ${explicitConfigPath}`);
    }
    const config = await parseConfigFile(resolved);
    return { config, config_path: resolved, config_sources: [resolved], prompt_files, skill_dirs };
  }

  // Otherwise, merge servers from all discovered sources
  const merged: Record<string, McpServerConfig> = {};
  const sources: string[] = [];

  // 1. User-scoped servers from ~/.claude.json (lowest priority)
  const userServers = await loadClaudeCodeServers("user");
  if (userServers) {
    Object.assign(merged, userServers.servers);
    sources.push(`${CLAUDE_CODE_CONFIG} (user)`);
  }

  // 2. Claude Desktop config (also low priority)
  const desktopConfig = await loadDesktopConfig();
  if (desktopConfig) {
    Object.assign(merged, desktopConfig.servers);
    sources.push(CLAUDE_DESKTOP_CONFIG);
  }

  // 3. Local/project-scoped servers from ~/.claude.json (medium priority)
  const localServers = await loadClaudeCodeServers("local");
  if (localServers) {
    Object.assign(merged, localServers.servers);
    sources.push(`${CLAUDE_CODE_CONFIG} (local)`);
  }

  // 4. Project .mcp.json (highest priority — overrides all)
  const projectConfig = await loadProjectMcpConfig();
  if (projectConfig) {
    Object.assign(merged, projectConfig.servers);
    sources.push(projectConfig.path);
  }

  const config_path = sources[sources.length - 1] ?? ".mcp.json";

  return {
    config: { mcpServers: merged },
    config_path,
    config_sources: sources,
    prompt_files,
    skill_dirs,
  };
}

// ── Source loaders ────────────────────────────────────────

interface LoadedServers {
  servers: Record<string, McpServerConfig>;
  path: string;
}

/** Load project-level .mcp.json. */
async function loadProjectMcpConfig(): Promise<LoadedServers | null> {
  for (const candidate of PROJECT_CONFIG_PATHS) {
    const resolved = resolve(candidate);
    if (!existsSync(resolved)) continue;

    try {
      const config = await parseConfigFile(resolved);
      return { servers: config.mcpServers, path: resolved };
    } catch {
      // Invalid config — skip, doctor will catch this
    }
  }
  return null;
}

/**
 * Load MCP servers from ~/.claude.json (Claude Code's config).
 *
 * Structure:
 * {
 *   "mcpServers": { ... },               // user-scoped
 *   "projects": {
 *     "/path/to/project": {
 *       "mcpServers": { ... }             // local/project-scoped
 *     }
 *   }
 * }
 */
async function loadClaudeCodeServers(
  scope: "user" | "local",
): Promise<LoadedServers | null> {
  if (!existsSync(CLAUDE_CODE_CONFIG)) return null;

  let json: Record<string, unknown>;
  try {
    const raw = await readFile(CLAUDE_CODE_CONFIG, "utf-8");
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (scope === "user") {
    const servers = extractMcpServers(json["mcpServers"]);
    if (servers && Object.keys(servers).length > 0) {
      return { servers, path: CLAUDE_CODE_CONFIG };
    }
    return null;
  }

  // local scope — look up by current working directory
  const projects = json["projects"] as Record<string, Record<string, unknown>> | undefined;
  if (!projects) return null;

  const cwd = process.cwd();
  const projectEntry = projects[cwd];
  if (!projectEntry) return null;

  const servers = extractMcpServers(projectEntry["mcpServers"]);
  if (servers && Object.keys(servers).length > 0) {
    return { servers, path: CLAUDE_CODE_CONFIG };
  }
  return null;
}

/** Load Claude Desktop config. */
async function loadDesktopConfig(): Promise<LoadedServers | null> {
  if (!existsSync(CLAUDE_DESKTOP_CONFIG)) return null;

  try {
    const config = await parseConfigFile(CLAUDE_DESKTOP_CONFIG);
    if (Object.keys(config.mcpServers).length > 0) {
      return { servers: config.mcpServers, path: CLAUDE_DESKTOP_CONFIG };
    }
  } catch {
    // Invalid config — skip
  }
  return null;
}

/** Safely extract and validate mcpServers from an unknown value. */
function extractMcpServers(
  value: unknown,
): Record<string, McpServerConfig> | null {
  if (!value || typeof value !== "object") return null;

  const servers: Record<string, McpServerConfig> = {};
  for (const [name, serverConfig] of Object.entries(value as Record<string, unknown>)) {
    try {
      servers[name] = mcpServerConfigSchema.parse(serverConfig);
    } catch {
      // Invalid server config — skip this server
    }
  }
  return Object.keys(servers).length > 0 ? servers : null;
}

// ── Config parsing ────────────────────────────────────────

async function parseConfigFile(path: string): Promise<McpConfig> {
  const raw = await readFile(path, "utf-8");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse MCP config at ${path}: ${detail}`);
  }
  return mcpConfigSchema.parse(json);
}

// ── Prompt & skill discovery ──────────────────────────────

function findPromptFiles(): string[] {
  const candidates = ["CLAUDE.md", "AGENTS.md"];
  return candidates.filter((f) => existsSync(resolve(f)));
}

function findSkillDirs(): string[] {
  const candidates = [
    "skills",
    ".skills",
    join(".claude", "skills"),
  ];
  return candidates.filter((d) => existsSync(resolve(d)));
}

// ── Instruction file discovery ──────────────────────────

/** Known instruction file names used in agentic projects. */
const INSTRUCTION_NAMES = new Set([
  "claude.md",
  "agents.md",
  "instructions.md",
  "system.md",
  "prompt.md",
  "agent.md",
]);

/** Directories to skip during recursive discovery. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".agentctl",
  ".next",
  "__pycache__",
  ".venv",
  "vendor",
]);

/**
 * Recursively discover instruction .md files in the project tree.
 * Looks for known instruction filenames (CLAUDE.md, AGENTS.md, etc.)
 * as well as any .md files inside .claude/ directories.
 */
export async function discoverInstructionFiles(
  root: string = process.cwd(),
  maxDepth: number = 6,
): Promise<InstructionFile[]> {
  const results: InstructionFile[] = [];
  const absRoot = resolve(root);

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(absRoot, fullPath);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;

        // .claude/ directory — scan for any .md files inside
        if (entry.name === ".claude") {
          await scanClaudeDir(fullPath, absRoot, depth + 1, results);
          continue;
        }

        await walk(fullPath, depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();

      // Match known instruction file names at any depth
      if (INSTRUCTION_NAMES.has(lower)) {
        const content = await safeRead(fullPath);
        if (content === null) continue;

        results.push({
          path: relPath,
          depth,
          token_count: countTokens(content),
          scope: depth === 0 ? "root" : "nested",
        });
      }
    }
  }

  await walk(absRoot, 0);
  return results;
}

/** Scan a .claude/ directory for all .md files. */
async function scanClaudeDir(
  dir: string,
  root: string,
  depth: number,
  results: InstructionFile[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(root, fullPath);

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      const content = await safeRead(fullPath);
      if (content === null) continue;

      results.push({
        path: relPath,
        depth,
        token_count: countTokens(content),
        scope: "claude-dir",
      });
    }

    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      await scanClaudeDir(fullPath, root, depth + 1, results);
    }
  }
}

async function safeRead(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

/** Resolve environment variable references ($VAR or ${VAR}) in header values. */
export function resolveHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    resolved[key] = value.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/gi, (_, braced, bare) => {
      const envName = braced ?? bare;
      const envVal = process.env[envName];
      if (envVal === undefined) {
        throw new Error(`Environment variable ${envName} referenced in header "${key}" is not set`);
      }
      return envVal;
    });
  }
  return resolved;
}
