import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { McpConfig } from "../types.js";
import { mcpConfigSchema } from "./schemas.js";

const MCP_CONFIG_PATHS = [
  ".mcp.json",
  join(homedir(), ".claude", "claude_desktop_config.json"),
];

export interface DiscoveryResult {
  config: McpConfig;
  config_path: string;
  prompt_files: string[];
  skill_dirs: string[];
}

/** Find and parse MCP config, prompt files, and skill directories. */
export async function discoverInputs(
  explicitConfigPath?: string,
): Promise<DiscoveryResult> {
  const config_path = await findConfigPath(explicitConfigPath);
  const config = await parseConfigFile(config_path);
  const prompt_files = findPromptFiles();
  const skill_dirs = findSkillDirs();

  return { config, config_path, prompt_files, skill_dirs };
}

async function findConfigPath(explicit?: string): Promise<string> {
  if (explicit) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) {
      throw new Error(`Config file not found: ${explicit}`);
    }
    return resolved;
  }

  for (const candidate of MCP_CONFIG_PATHS) {
    const resolved = resolve(candidate);
    if (existsSync(resolved)) {
      return resolved;
    }
  }

  throw new Error(
    "No MCP config found. Run `agentctl init` or pass --config <path>.",
  );
}

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

function findPromptFiles(): string[] {
  const candidates = ["CLAUDE.md", "AGENTS.md"];
  return candidates.filter((f) => existsSync(resolve(f)));
}

function findSkillDirs(): string[] {
  const candidates = ["skills", ".skills"];
  return candidates.filter((d) => existsSync(resolve(d)));
}
