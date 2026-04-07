import { describe, it, expect } from "vitest";
import { buildReferenceGraph } from "../src/analysis/graph.js";
import type { AgenticReference } from "../src/types.js";

function makeRef(
  source: string,
  target: string,
  overrides?: Partial<AgenticReference>,
): AgenticReference {
  return {
    source,
    target,
    target_type: "instruction",
    reference_type: "wiki_link",
    confidence: 1.0,
    context: `${source} -> ${target}`,
    verified: true,
    category: "structural",
    ...overrides,
  };
}

describe("buildReferenceGraph", () => {
  it("computes linear chain connectivity", () => {
    const refs = [
      makeRef("A", "B"),
      makeRef("B", "C"),
    ];
    const nodes = [
      { id: "A", type: "instruction" as const },
      { id: "B", type: "instruction" as const },
      { id: "C", type: "instruction" as const },
    ];

    const graph = buildReferenceGraph(refs, ["A"], nodes);

    expect(graph.summary.total_nodes).toBe(3);
    expect(graph.summary.linked_nodes).toBe(3);
    expect(graph.summary.connectivity_pct).toBe(100);

    const nodeA = graph.nodes.find((n) => n.object_id === "A")!;
    expect(nodeA.linked).toBe(true);
    expect(nodeA.degrees_from_surface).toBe(0);

    const nodeB = graph.nodes.find((n) => n.object_id === "B")!;
    expect(nodeB.linked).toBe(true);
    expect(nodeB.degrees_from_surface).toBe(1);

    const nodeC = graph.nodes.find((n) => n.object_id === "C")!;
    expect(nodeC.linked).toBe(true);
    expect(nodeC.degrees_from_surface).toBe(2);
    expect(nodeC.reference_chain).toEqual(["A", "B", "C"]);
  });

  it("marks disconnected nodes as unlinked", () => {
    const refs = [makeRef("A", "B")];
    const nodes = [
      { id: "A", type: "instruction" as const },
      { id: "B", type: "instruction" as const },
      { id: "D", type: "instruction" as const },
    ];

    const graph = buildReferenceGraph(refs, ["A"], nodes);

    const nodeD = graph.nodes.find((n) => n.object_id === "D")!;
    expect(nodeD.linked).toBe(false);
    expect(nodeD.degrees_from_surface).toBeNull();
    expect(nodeD.reference_chain).toEqual([]);

    expect(graph.summary.linked_nodes).toBe(2);
    expect(graph.summary.unlinked_nodes).toBe(1);
    expect(graph.summary.connectivity_pct).toBe(67); // 2/3 rounded
  });

  it("handles multi-source BFS", () => {
    const refs = [
      makeRef("S1", "A"),
      makeRef("S2", "B"),
    ];
    const nodes = [
      { id: "S1", type: "instruction" as const },
      { id: "S2", type: "instruction" as const },
      { id: "A", type: "skill" as const },
      { id: "B", type: "mcp" as const },
    ];

    const graph = buildReferenceGraph(refs, ["S1", "S2"], nodes);

    expect(graph.summary.linked_nodes).toBe(4);
    expect(graph.summary.connectivity_pct).toBe(100);

    const nodeA = graph.nodes.find((n) => n.object_id === "A")!;
    expect(nodeA.degrees_from_surface).toBe(1);

    const nodeB = graph.nodes.find((n) => n.object_id === "B")!;
    expect(nodeB.degrees_from_surface).toBe(1);
  });

  it("computes max_depth correctly", () => {
    const refs = [
      makeRef("A", "B"),
      makeRef("B", "C"),
      makeRef("C", "D"),
    ];
    const nodes = [
      { id: "A", type: "instruction" as const },
      { id: "B", type: "instruction" as const },
      { id: "C", type: "instruction" as const },
      { id: "D", type: "instruction" as const },
    ];

    const graph = buildReferenceGraph(refs, ["A"], nodes);
    expect(graph.summary.max_depth).toBe(3);
  });

  it("counts broken references", () => {
    const refs = [
      makeRef("A", "B", { verified: false }),
      makeRef("A", "C", { verified: true }),
    ];
    const nodes = [
      { id: "A", type: "instruction" as const },
      { id: "B", type: "instruction" as const },
      { id: "C", type: "instruction" as const },
    ];

    const graph = buildReferenceGraph(refs, ["A"], nodes);
    expect(graph.broken_references).toHaveLength(1);
    expect(graph.broken_references[0].target).toBe("B");
    expect(graph.summary.broken_edges).toBe(1);
  });

  it("deduplicates edges keeping highest confidence", () => {
    const refs = [
      makeRef("A", "B", { confidence: 0.5 }),
      makeRef("A", "B", { confidence: 0.9 }),
    ];
    const nodes = [
      { id: "A", type: "instruction" as const },
      { id: "B", type: "instruction" as const },
    ];

    const graph = buildReferenceGraph(refs, ["A"], nodes);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].confidence).toBe(0.9);
  });

  it("returns empty graph for no nodes", () => {
    const graph = buildReferenceGraph([], [], []);

    expect(graph.summary.total_nodes).toBe(0);
    expect(graph.summary.linked_nodes).toBe(0);
    expect(graph.summary.connectivity_pct).toBe(0);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });

  it("counts structural vs semantic edges", () => {
    const refs = [
      makeRef("A", "B", { category: "structural" }),
      makeRef("A", "C", { category: "semantic" }),
    ];
    const nodes = [
      { id: "A", type: "instruction" as const },
      { id: "B", type: "instruction" as const },
      { id: "C", type: "instruction" as const },
    ];

    const graph = buildReferenceGraph(refs, ["A"], nodes);
    expect(graph.summary.structural_edges).toBe(1);
    expect(graph.summary.semantic_edges).toBe(1);
  });

  it("tracks incoming and outgoing references per node", () => {
    const refs = [
      makeRef("A", "B"),
      makeRef("A", "C"),
      makeRef("B", "C"),
    ];
    const nodes = [
      { id: "A", type: "instruction" as const },
      { id: "B", type: "instruction" as const },
      { id: "C", type: "instruction" as const },
    ];

    const graph = buildReferenceGraph(refs, ["A"], nodes);

    const nodeA = graph.nodes.find((n) => n.object_id === "A")!;
    expect(nodeA.references).toHaveLength(2); // A->B, A->C
    expect(nodeA.referenced_by).toHaveLength(0);

    const nodeC = graph.nodes.find((n) => n.object_id === "C")!;
    expect(nodeC.references).toHaveLength(0);
    expect(nodeC.referenced_by).toHaveLength(2); // A->C, B->C
  });

  it("records context_surface_nodes", () => {
    const graph = buildReferenceGraph(
      [],
      ["CLAUDE.md", "AGENTS.md"],
      [
        { id: "CLAUDE.md", type: "instruction" },
        { id: "AGENTS.md", type: "instruction" },
      ],
    );

    expect(graph.context_surface_nodes).toEqual(["CLAUDE.md", "AGENTS.md"]);
  });
});
