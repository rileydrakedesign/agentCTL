/** Tokenize text into lowercase terms (length > 1). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/** Compute inverse document frequency across a corpus. */
export function computeIdf(docs: string[][]): Map<string, number> {
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

/** Compute TF-IDF vector for a document. */
export function tfidf(doc: string[], idf: Map<string, number>): Map<string, number> {
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

/** Compute cosine similarity between two TF-IDF vectors. */
export function cosineSimilarity(
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
