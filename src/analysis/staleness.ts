import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ReferenceGraph, RulesFile, StaleEntity } from "../types.js";

/** Detect stale references, dead globs, and missing directories. */
export function detectStaleness(
  referenceGraph: ReferenceGraph,
  rulesFiles?: RulesFile[],
  skillDirs?: string[],
  rootDir?: string,
): StaleEntity[] {
  const results: StaleEntity[] = [];

  // Tier 1: Broken references from the reference graph
  for (const ref of referenceGraph.broken_references) {
    results.push({
      source: ref.source,
      line_number: ref.line_number,
      staleness_type: "broken_reference",
      stale_target: ref.target,
      confidence: 1.0,
      detail: `Reference to "${ref.target}" is broken — target does not exist`,
      tier: 1,
    });
  }

  // Tier 2: Rules files with dead glob patterns
  if (rulesFiles && rootDir) {
    for (const rules of rulesFiles) {
      if (!rules.glob_patterns || rules.glob_patterns.length === 0) continue;

      for (const pattern of rules.glob_patterns) {
        // Simple check: if the pattern's base directory doesn't exist, it's dead
        const baseDir = extractBaseDir(pattern);
        if (baseDir) {
          const fullPath = resolve(rootDir, baseDir);
          if (!existsSync(fullPath)) {
            results.push({
              source: rules.path,
              staleness_type: "dead_glob",
              stale_target: pattern,
              confidence: 1.0,
              detail: `Glob pattern "${pattern}" base directory "${baseDir}" does not exist`,
              tier: 2,
            });
          }
        }
      }
    }
  }

  // Tier 2: Missing skill directories
  if (skillDirs && rootDir) {
    for (const dir of skillDirs) {
      const fullPath = resolve(rootDir, dir);
      if (!existsSync(fullPath)) {
        results.push({
          source: "config",
          staleness_type: "missing_skill_dir",
          stale_target: dir,
          confidence: 1.0,
          detail: `Skill directory "${dir}" does not exist`,
          tier: 2,
        });
      }
    }
  }

  return results;
}

/** Extract the base directory from a glob pattern (e.g., "src/api/**\/*.ts" -> "src/api"). */
function extractBaseDir(pattern: string): string | null {
  const parts = pattern.split("/");
  const staticParts: string[] = [];
  for (const part of parts) {
    if (part.includes("*") || part.includes("{") || part.includes("?")) break;
    staticParts.push(part);
  }
  return staticParts.length > 0 ? staticParts.join("/") : null;
}
