import { describe, it, expect } from "vitest";
import { detectStructuralReferences } from "../src/analysis/references.js";
import type { InstructionFile, ParsedSkill } from "../src/types.js";

function makeInstruction(path: string, depth = 0, scope: "root" | "nested" | "claude-dir" = "root"): InstructionFile {
  return { path, depth, token_count: 100, scope };
}

describe("detectStructuralReferences", () => {
  const rootDir = "/project";

  it("detects explicit file paths in backticks", () => {
    const instructions = [makeInstruction("CLAUDE.md")];
    const contents = new Map([
      ["CLAUDE.md", "See `src/api/CLAUDE.md` for API-specific instructions."],
    ]);

    const refs = detectStructuralReferences(instructions, contents, [], [], rootDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].source).toBe("CLAUDE.md");
    expect(refs[0].target).toBe("src/api/CLAUDE.md");
    expect(refs[0].reference_type).toBe("explicit_path");
    expect(refs[0].confidence).toBe(1.0);
    expect(refs[0].verified).toBe(false); // file doesn't actually exist
    expect(refs[0].category).toBe("structural");
  });

  it("detects relative file paths", () => {
    const instructions = [makeInstruction("src/CLAUDE.md", 1, "nested")];
    const contents = new Map([
      ["src/CLAUDE.md", "Follow the patterns in ./auth/instructions.md."],
    ]);

    const refs = detectStructuralReferences(instructions, contents, [], [], rootDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].target).toBe("src/auth/instructions.md");
    expect(refs[0].reference_type).toBe("explicit_path");
  });

  it("detects wiki-style links that resolve to known entities", () => {
    const instructions = [
      makeInstruction("CLAUDE.md"),
      makeInstruction("auth-patterns.md"),
    ];
    const contents = new Map([
      ["CLAUDE.md", "Follow the patterns in [[auth-patterns]]."],
    ]);

    const refs = detectStructuralReferences(instructions, contents, [], [], rootDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].source).toBe("CLAUDE.md");
    expect(refs[0].target).toBe("auth-patterns.md");
    expect(refs[0].reference_type).toBe("wiki_link");
    expect(refs[0].confidence).toBe(0.9);
    expect(refs[0].verified).toBe(true);
    expect(refs[0].target_type).toBe("instruction");
  });

  it("detects broken wiki links (target not found)", () => {
    const instructions = [makeInstruction("CLAUDE.md")];
    const contents = new Map([
      ["CLAUDE.md", "See [[nonexistent-doc]] for details."],
    ]);

    const refs = detectStructuralReferences(instructions, contents, [], [], rootDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].target).toBe("nonexistent-doc");
    expect(refs[0].verified).toBe(false);
    expect(refs[0].target_type).toBe("unknown");
    expect(refs[0].confidence).toBe(1.0);
  });

  it("detects MCP server mentions in backticks", () => {
    const instructions = [makeInstruction("CLAUDE.md")];
    const contents = new Map([
      ["CLAUDE.md", "Use the `github` server for all PR operations."],
    ]);

    const refs = detectStructuralReferences(instructions, contents, [], ["github", "filesystem"], rootDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].target).toBe("mcp:github");
    expect(refs[0].target_type).toBe("mcp");
    expect(refs[0].reference_type).toBe("mcp_name_mention");
    expect(refs[0].verified).toBe(true);
  });

  it("detects MCP server mentions in prose", () => {
    const instructions = [makeInstruction("CLAUDE.md")];
    const contents = new Map([
      ["CLAUDE.md", "The filesystem MCP server provides file access."],
    ]);

    const refs = detectStructuralReferences(instructions, contents, [], ["filesystem"], rootDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].target).toBe("mcp:filesystem");
    expect(refs[0].reference_type).toBe("mcp_name_mention");
  });

  it("detects skill mentions with slash command syntax", () => {
    const skills: ParsedSkill[] = [
      { name: "deploy", path: "skills/deploy/SKILL.md", content: "Deploy", token_count: 50 },
    ];
    const instructions = [makeInstruction("CLAUDE.md")];
    const contents = new Map([
      ["CLAUDE.md", "Run the /deploy skill after code review."],
    ]);

    const refs = detectStructuralReferences(instructions, contents, skills, [], rootDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].target).toBe("skill:deploy");
    expect(refs[0].target_type).toBe("skill");
    expect(refs[0].reference_type).toBe("skill_name_mention");
  });

  it("detects skill mentions in prose", () => {
    const skills: ParsedSkill[] = [
      { name: "code-review", path: "skills/code-review/SKILL.md", content: "Review", token_count: 50 },
    ];
    const instructions = [makeInstruction("CLAUDE.md")];
    const contents = new Map([
      ["CLAUDE.md", "Use the code-review skill for all PRs."],
    ]);

    const refs = detectStructuralReferences(instructions, contents, skills, [], rootDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].target).toBe("skill:code-review");
    expect(refs[0].reference_type).toBe("skill_name_mention");
  });

  it("deduplicates same source->target references", () => {
    const instructions = [makeInstruction("CLAUDE.md")];
    const contents = new Map([
      ["CLAUDE.md", "Use `github` server.\nThe `github` MCP is required."],
    ]);

    const refs = detectStructuralReferences(instructions, contents, [], ["github"], rootDir);
    // Should only have one reference to github despite two mentions
    const githubRefs = refs.filter((r) => r.target === "mcp:github");
    expect(githubRefs).toHaveLength(1);
  });

  it("returns empty for no content", () => {
    const refs = detectStructuralReferences([], new Map(), [], [], rootDir);
    expect(refs).toEqual([]);
  });

  it("includes line numbers", () => {
    const instructions = [makeInstruction("CLAUDE.md")];
    const contents = new Map([
      ["CLAUDE.md", "First line.\nSecond line.\nUse the `github` server here."],
    ]);

    const refs = detectStructuralReferences(instructions, contents, [], ["github"], rootDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].line_number).toBe(3);
  });

  it("handles multiple reference types in one file", () => {
    const instructions = [
      makeInstruction("CLAUDE.md"),
      makeInstruction("auth-patterns.md"),
    ];
    const skills: ParsedSkill[] = [
      { name: "deploy", path: "skills/deploy/SKILL.md", content: "x", token_count: 50 },
    ];
    const contents = new Map([
      ["CLAUDE.md", [
        "See [[auth-patterns]] for auth guidelines.",
        "Use the `github` server for PRs.",
        "Run /deploy after review.",
      ].join("\n")],
    ]);

    const refs = detectStructuralReferences(instructions, contents, skills, ["github"], rootDir);
    expect(refs).toHaveLength(3);

    const types = refs.map((r) => r.reference_type).sort();
    expect(types).toEqual(["mcp_name_mention", "skill_name_mention", "wiki_link"]);
  });
});
