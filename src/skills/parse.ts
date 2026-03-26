import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { countTokens } from "../tokens/tokenizer.js";
import type { ParsedSkill } from "../types.js";

/** Parse SKILL.md files from skill directories. */
export async function parseSkillDirs(
  dirs: string[],
): Promise<ParsedSkill[]> {
  const skills: ParsedSkill[] = [];

  for (const dir of dirs) {
    const absDir = resolve(dir);
    if (!existsSync(absDir)) continue;

    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillMdPath = join(absDir, entry.name, "SKILL.md");
      if (!existsSync(skillMdPath)) continue;

      try {
        const content = await readFile(skillMdPath, "utf-8");
        skills.push({
          name: entry.name,
          path: skillMdPath,
          content,
          token_count: countTokens(content),
        });
      } catch {
        // Unreadable file — skip silently, doctor will catch this
      }
    }
  }

  return skills;
}
