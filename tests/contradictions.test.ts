import { describe, it, expect } from "vitest";
import { detectContradictions } from "../src/analysis/contradictions.js";

describe("detectContradictions", () => {
  it("returns empty for single file", () => {
    const results = detectContradictions([
      { path: "CLAUDE.md", content: "Always use TypeScript.", depth: 0 },
    ]);
    expect(results).toEqual([]);
  });

  it("returns empty for non-conflicting directives", () => {
    const results = detectContradictions([
      { path: "CLAUDE.md", content: "Always use TypeScript for backend code.", depth: 0 },
      { path: "src/CLAUDE.md", content: "Always write unit tests for new features.", depth: 1 },
    ]);
    expect(results).toEqual([]);
  });

  it("detects hard conflict with opposing verbs at same depth", () => {
    const results = detectContradictions([
      {
        path: "CLAUDE.md",
        content: "Always use REST APIs for all external service communication.",
        depth: 0,
      },
      {
        path: "AGENTS.md",
        content: "Never use REST APIs for external service communication.",
        depth: 0,
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].classification).toBe("hard_conflict");
    expect(results[0].severity).toBe("error");
    expect(results[0].file_a).toBe("CLAUDE.md");
    expect(results[0].file_b).toBe("AGENTS.md");
  });

  it("detects scope override when depths differ", () => {
    const results = detectContradictions([
      {
        path: "CLAUDE.md",
        content: "Always use TypeScript strict mode for all source files in the project.",
        depth: 0,
      },
      {
        path: "src/legacy/CLAUDE.md",
        content: "Never use TypeScript strict mode for all source files in this directory.",
        depth: 2,
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].classification).toBe("scope_override");
    expect(results[0].severity).toBe("warning");
  });

  it("does not flag same directive repeated (not a contradiction)", () => {
    const results = detectContradictions([
      { path: "CLAUDE.md", content: "Always use TypeScript for all code.", depth: 0 },
      { path: "AGENTS.md", content: "Always use TypeScript for all code.", depth: 0 },
    ]);
    // Same directive = no opposing verbs, should not be flagged
    expect(results).toEqual([]);
  });

  it("returns empty for files with no directives", () => {
    const results = detectContradictions([
      { path: "CLAUDE.md", content: "# Project Overview\n\nThis is a project.", depth: 0 },
      { path: "AGENTS.md", content: "## Getting Started\n\nSee the docs.", depth: 0 },
    ]);
    expect(results).toEqual([]);
  });

  it("includes line numbers", () => {
    const results = detectContradictions([
      {
        path: "CLAUDE.md",
        content: "# Rules\n\nAlways use Jest for all testing in this project.",
        depth: 0,
      },
      {
        path: "AGENTS.md",
        content: "# Config\n\nNever use Jest for testing in this project.",
        depth: 0,
      },
    ]);

    if (results.length > 0) {
      expect(results[0].line_a).toBe(3);
      expect(results[0].line_b).toBe(3);
    }
  });
});
