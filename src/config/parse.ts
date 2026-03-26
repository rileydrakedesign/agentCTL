import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { ProjectConfig } from "../types.js";
import { projectConfigSchema } from "./schemas.js";

const DEFAULT_CONFIG: ProjectConfig = {
  version: 1,
  project: { name: "unnamed" },
  runtime_targets: [{ model: "claude-sonnet-4-6", context_window: 200_000 }],
};

/** Load agentctl.yaml from cwd. Returns defaults if file doesn't exist. */
export async function loadProjectConfig(
  path?: string,
): Promise<ProjectConfig> {
  const configPath = resolve(path ?? "agentctl.yaml");

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  const raw = await readFile(configPath, "utf-8");
  const parsed = parseYaml(raw);
  return projectConfigSchema.parse(parsed);
}
