import { readFile, writeFile, copyFile, access, constants } from "node:fs/promises";
import type { OptimizeAction, ManualFinding } from "../types.js";

export interface ApplyOptions {
  configPath: string;
  backup: boolean;
}

export interface ApplyResult {
  backupPath: string | null;
  writtenPath: string;
}

/** Read raw config JSON, preserving extra keys beyond mcpServers. */
export async function readRawConfig(
  configPath: string,
): Promise<Record<string, unknown>> {
  const text = await readFile(configPath, "utf-8");
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * Filter actions to only those targeting servers present in the target file.
 * Servers from other config sources are downgraded to ManualFindings.
 */
export function filterActionsForFile(
  rawConfig: Record<string, unknown>,
  actions: OptimizeAction[],
): { applicable: OptimizeAction[]; extraFindings: ManualFinding[] } {
  const servers = rawConfig.mcpServers as Record<string, unknown> | undefined;
  const fileServers = new Set(servers ? Object.keys(servers) : []);

  const applicable: OptimizeAction[] = [];
  const extraFindings: ManualFinding[] = [];

  for (const action of actions) {
    if (fileServers.has(action.server)) {
      applicable.push(action);
    } else {
      extraFindings.push({
        server: action.server,
        tool: "*",
        issue: "dead_tool",
        detail: `Server defined in another config source, not in ${action.server} — remove manually`,
      });
    }
  }

  return { applicable, extraFindings };
}

/** Apply optimizations: remove servers from config, optionally backup. */
export async function applyOptimizations(
  rawConfig: Record<string, unknown>,
  actions: OptimizeAction[],
  options: ApplyOptions,
): Promise<ApplyResult> {
  // Check writability
  try {
    await access(options.configPath, constants.W_OK);
  } catch {
    throw new Error(
      `Config file is not writable: ${options.configPath}`,
    );
  }

  const servers = rawConfig.mcpServers as Record<string, unknown> | undefined;
  if (!servers) {
    throw new Error("Config file has no mcpServers key");
  }

  const originalCount = Object.keys(servers).length;
  const toRemove = new Set(actions.map((a) => a.server));

  // Safety guard: refuse to wipe all servers
  const remainingCount = originalCount - toRemove.size;
  if (remainingCount === 0 && originalCount > 0) {
    throw new Error(
      "Refusing to remove all servers from config. Use manual editing if this is intentional.",
    );
  }

  // Backup
  let backupPath: string | null = null;
  if (options.backup) {
    backupPath = `${options.configPath}.backup`;
    await copyFile(options.configPath, backupPath);
  }

  // Remove servers
  for (const server of toRemove) {
    delete servers[server];
  }

  // Write back
  await writeFile(
    options.configPath,
    JSON.stringify(rawConfig, null, 2) + "\n",
  );

  return { backupPath, writtenPath: options.configPath };
}
