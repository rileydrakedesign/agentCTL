import type { ServerScanResult, RedundancyCluster } from "../types.js";
import { tokenize, computeIdf, tfidf, cosineSimilarity } from "./text-similarity.js";

const SIMILARITY_THRESHOLD = 0.8;

interface ToolRef {
  key: string; // "server:tool"
  description: string;
  tokens: number;
}

/** Detect redundant tool clusters across servers using TF-IDF cosine similarity. */
export function detectRedundancy(
  servers: ServerScanResult[],
): RedundancyCluster[] {
  const tools: ToolRef[] = [];
  for (const server of servers) {
    if (server.status !== "ok") continue;
    for (const tool of server.tools) {
      tools.push({
        key: `${server.server}:${tool.name}`,
        description: tool.description,
        tokens: tool.token_estimate.total,
      });
    }
  }

  // Build vocabulary and TF-IDF vectors
  const docs = tools.map((t) => tokenize(t.description));
  const idf = computeIdf(docs);
  const vectors = docs.map((doc) => tfidf(doc, idf));

  // Pairwise comparison — only cross-server pairs
  const clusters: RedundancyCluster[] = [];
  const clustered = new Set<string>();

  for (let i = 0; i < tools.length; i++) {
    if (clustered.has(tools[i].key)) continue;
    for (let j = i + 1; j < tools.length; j++) {
      if (clustered.has(tools[j].key)) continue;
      // Only flag cross-server redundancy
      const serverA = tools[i].key.split(":")[0];
      const serverB = tools[j].key.split(":")[0];
      if (serverA === serverB) continue;

      const sim = cosineSimilarity(vectors[i], vectors[j]);
      if (sim >= SIMILARITY_THRESHOLD) {
        const smaller = Math.min(tools[i].tokens, tools[j].tokens);
        clusters.push({
          tools: [tools[i].key, tools[j].key],
          similarity: Math.round(sim * 100) / 100,
          token_savings_if_consolidated: smaller,
        });
        clustered.add(tools[i].key);
        clustered.add(tools[j].key);
      }
    }
  }

  return clusters;
}

