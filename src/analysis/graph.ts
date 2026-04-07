import type {
  AgenticReference,
  ConnectivityStatus,
  ReferenceGraph,
  ReferenceGraphSummary,
} from "../types.js";

interface NodeInput {
  id: string;
  type: "instruction" | "skill" | "mcp" | "rules";
}

/** Build a reference graph and compute connectivity via BFS from surface nodes. */
export function buildReferenceGraph(
  references: AgenticReference[],
  surfaceNodeIds: string[],
  allNodes: NodeInput[],
): ReferenceGraph {
  // Build node type map
  const nodeTypeMap = new Map<string, NodeInput["type"]>();
  for (const node of allNodes) {
    nodeTypeMap.set(node.id, node.type);
  }

  // Deduplicate edges: same source->target keeps highest confidence
  const edgeMap = new Map<string, AgenticReference>();
  for (const ref of references) {
    const key = `${ref.source}::${ref.target}`;
    const existing = edgeMap.get(key);
    if (!existing || ref.confidence > existing.confidence) {
      edgeMap.set(key, ref);
    }
  }
  const edges = Array.from(edgeMap.values());

  // Build adjacency list (outgoing edges per node)
  const adjacency = new Map<string, AgenticReference[]>();
  const incomingEdges = new Map<string, AgenticReference[]>();

  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge);

    if (!incomingEdges.has(edge.target)) incomingEdges.set(edge.target, []);
    incomingEdges.get(edge.target)!.push(edge);
  }

  // Multi-source BFS from surface nodes
  const visited = new Map<string, { depth: number; chain: string[] }>();
  const queue: Array<{ id: string; depth: number; chain: string[] }> = [];

  for (const surfaceId of surfaceNodeIds) {
    if (!visited.has(surfaceId)) {
      visited.set(surfaceId, { depth: 0, chain: [surfaceId] });
      queue.push({ id: surfaceId, depth: 0, chain: [surfaceId] });
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const outgoing = adjacency.get(current.id) ?? [];

    for (const edge of outgoing) {
      if (!visited.has(edge.target)) {
        const chain = [...current.chain, edge.target];
        visited.set(edge.target, { depth: current.depth + 1, chain });
        queue.push({ id: edge.target, depth: current.depth + 1, chain });
      }
    }
  }

  // Build connectivity status for each node
  const allNodeIds = new Set(allNodes.map((n) => n.id));
  const broken: AgenticReference[] = [];
  let maxDepth = 0;

  const nodes: ConnectivityStatus[] = allNodes.map((node) => {
    const bfsResult = visited.get(node.id);
    const linked = bfsResult !== undefined;
    const depth = bfsResult?.depth ?? null;
    if (depth !== null && depth > maxDepth) maxDepth = depth;

    const outgoing = (adjacency.get(node.id) ?? []).filter((e) =>
      allNodeIds.has(e.target),
    );
    const incoming = (incomingEdges.get(node.id) ?? []).filter((e) =>
      allNodeIds.has(e.source),
    );

    return {
      object_id: node.id,
      object_type: node.type,
      linked,
      degrees_from_surface: depth,
      reference_chain: bfsResult?.chain ?? [],
      referenced_by: incoming,
      references: outgoing,
      structural_ref_count: outgoing.filter((e) => e.category === "structural").length +
        incoming.filter((e) => e.category === "structural").length,
      semantic_ref_count: outgoing.filter((e) => e.category === "semantic").length +
        incoming.filter((e) => e.category === "semantic").length,
    };
  });

  // Collect broken references
  for (const edge of edges) {
    if (!edge.verified) {
      broken.push(edge);
    }
  }

  // Compute summary
  const linkedCount = nodes.filter((n) => n.linked).length;
  const totalCount = nodes.length;
  const summary: ReferenceGraphSummary = {
    total_nodes: totalCount,
    linked_nodes: linkedCount,
    unlinked_nodes: totalCount - linkedCount,
    connectivity_pct:
      totalCount > 0 ? Math.round((linkedCount / totalCount) * 100) : 0,
    max_depth: maxDepth,
    structural_edges: edges.filter((e) => e.category === "structural").length,
    semantic_edges: edges.filter((e) => e.category === "semantic").length,
    lat_edges: edges.filter(
      (e) => e.reference_type === "lat_annotation" || e.reference_type === "lat_file",
    ).length,
    broken_edges: broken.length,
  };

  return {
    context_surface_nodes: surfaceNodeIds,
    nodes,
    edges,
    broken_references: broken,
    summary,
  };
}
