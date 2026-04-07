import { describe, it, expect } from "vitest";
import { detectStaleness } from "../src/analysis/staleness.js";
import type { ReferenceGraph, AgenticReference } from "../src/types.js";

function makeGraph(overrides?: Partial<ReferenceGraph>): ReferenceGraph {
  return {
    context_surface_nodes: [],
    nodes: [],
    edges: [],
    broken_references: [],
    summary: {
      total_nodes: 0,
      linked_nodes: 0,
      unlinked_nodes: 0,
      connectivity_pct: 0,
      max_depth: 0,
      structural_edges: 0,
      semantic_edges: 0,
      lat_edges: 0,
      broken_edges: 0,
    },
    ...overrides,
  };
}

function makeBrokenRef(source: string, target: string): AgenticReference {
  return {
    source,
    target,
    target_type: "instruction",
    reference_type: "wiki_link",
    confidence: 1.0,
    context: `[[${target}]]`,
    line_number: 5,
    verified: false,
    category: "structural",
  };
}

describe("detectStaleness", () => {
  it("returns empty for healthy graph with no rules", () => {
    const graph = makeGraph();
    const results = detectStaleness(graph);
    expect(results).toEqual([]);
  });

  it("detects broken references from graph (tier 1)", () => {
    const brokenRef = makeBrokenRef("CLAUDE.md", "nonexistent.md");
    const graph = makeGraph({
      broken_references: [brokenRef],
    });

    const results = detectStaleness(graph);
    expect(results).toHaveLength(1);
    expect(results[0].staleness_type).toBe("broken_reference");
    expect(results[0].tier).toBe(1);
    expect(results[0].source).toBe("CLAUDE.md");
    expect(results[0].stale_target).toBe("nonexistent.md");
    expect(results[0].confidence).toBe(1.0);
  });

  it("detects dead globs with missing base directory (tier 2)", () => {
    const graph = makeGraph();
    const rulesFiles = [
      {
        path: ".cursor/rules/api.mdc",
        platform: "cursor" as const,
        token_count: 100,
        glob_patterns: ["src/nonexistent-dir/**/*.ts"],
        always_active: false,
      },
    ];

    const results = detectStaleness(graph, rulesFiles, [], "/tmp/test-project");
    expect(results).toHaveLength(1);
    expect(results[0].staleness_type).toBe("dead_glob");
    expect(results[0].tier).toBe(2);
    expect(results[0].stale_target).toBe("src/nonexistent-dir/**/*.ts");
  });

  it("does not flag globs when base directory exists", () => {
    const graph = makeGraph();
    const rulesFiles = [
      {
        path: ".cursor/rules/src.mdc",
        platform: "cursor" as const,
        token_count: 100,
        glob_patterns: ["src/**/*.ts"],
        always_active: false,
      },
    ];

    // Use current project root where src/ exists
    const results = detectStaleness(graph, rulesFiles, [], process.cwd());
    expect(results).toHaveLength(0);
  });

  it("detects missing skill directories (tier 2)", () => {
    const graph = makeGraph();
    const results = detectStaleness(
      graph,
      [],
      ["nonexistent-skills"],
      "/tmp/test-project",
    );

    expect(results).toHaveLength(1);
    expect(results[0].staleness_type).toBe("missing_skill_dir");
    expect(results[0].tier).toBe(2);
    expect(results[0].stale_target).toBe("nonexistent-skills");
  });

  it("combines tier 1 and tier 2 results", () => {
    const brokenRef = makeBrokenRef("CLAUDE.md", "deleted.md");
    const graph = makeGraph({ broken_references: [brokenRef] });

    const results = detectStaleness(
      graph,
      [],
      ["missing-skills"],
      "/tmp/test-project",
    );

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.tier).sort()).toEqual([1, 2]);
  });
});
