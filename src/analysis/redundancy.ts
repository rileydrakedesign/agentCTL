import type { ServerScanResult, RedundancyCluster } from "../types.js";

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

// ── TF-IDF helpers ──────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function computeIdf(docs: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of docs) {
    const unique = new Set(doc);
    for (const term of unique) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  const N = docs.length;
  for (const [term, count] of df) {
    idf.set(term, Math.log(1 + N / (1 + count)));
  }
  return idf;
}

function tfidf(doc: string[], idf: Map<string, number>): Map<string, number> {
  const tf = new Map<string, number>();
  for (const term of doc) {
    tf.set(term, (tf.get(term) ?? 0) + 1);
  }
  const vector = new Map<string, number>();
  for (const [term, count] of tf) {
    vector.set(term, count * (idf.get(term) ?? 0));
  }
  return vector;
}

function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const [term, val] of a) {
    magA += val * val;
    if (b.has(term)) dot += val * b.get(term)!;
  }
  for (const val of b.values()) {
    magB += val * val;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
