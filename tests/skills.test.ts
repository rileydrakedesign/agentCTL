import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { parseSkillDirs } from "../src/skills/parse.js";

const FIXTURES = resolve(__dirname, "fixtures/skills");

describe("parseSkillDirs", () => {
  it("returns empty for no directories", async () => {
    const skills = await parseSkillDirs([]);
    expect(skills).toEqual([]);
  });

  it("returns empty for non-existent directory", async () => {
    const skills = await parseSkillDirs(["/nonexistent/dir"]);
    expect(skills).toEqual([]);
  });

  it("parses SKILL.md files from subdirectories", async () => {
    const skills = await parseSkillDirs([FIXTURES]);
    expect(skills).toHaveLength(2);

    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(["code-review", "deploy"]);
  });

  it("skips subdirectories without SKILL.md", async () => {
    const skills = await parseSkillDirs([FIXTURES]);
    const names = skills.map((s) => s.name);
    expect(names).not.toContain("no-skill");
  });

  it("computes token counts for each skill", async () => {
    const skills = await parseSkillDirs([FIXTURES]);
    for (const skill of skills) {
      expect(skill.token_count).toBeGreaterThan(0);
      expect(skill.content.length).toBeGreaterThan(0);
      expect(skill.path).toContain("SKILL.md");
    }
  });
});
