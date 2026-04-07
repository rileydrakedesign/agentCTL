import type { Contradiction, ConflictClass, ConflictSeverity } from "../types.js";
import { tokenize, computeIdf, tfidf, cosineSimilarity } from "./text-similarity.js";

interface DirectiveInput {
  path: string;
  content: string;
  depth: number;
}

interface ExtractedDirective {
  text: string;
  path: string;
  depth: number;
  line_number: number;
}

const TOPIC_SIMILARITY_THRESHOLD = 0.6;

// Patterns that indicate imperative/directive statements
const DIRECTIVE_PATTERNS = [
  /\b(?:always|never|must|shall)\b/i,
  /\b(?:do not|don't|should not|shouldn't)\b/i,
  /\b(?:use|avoid|prefer)\b.*\b(?:for|when|in|to)\b/i,
  /\b(?:when)\b.*\b(?:use|do|run|apply|follow)\b/i,
];

// Opposing verb pairs
const OPPOSING_VERBS: Array<[RegExp, RegExp]> = [
  [/\balways\b/i, /\bnever\b/i],
  [/\buse\b/i, /\bavoid\b/i],
  [/\bdo\b/i, /\bdo\s+not\b|don't/i],
  [/\bmust\b/i, /\bshould\s+not\b|shouldn't|must\s+not\b/i],
  [/\bprefer\b/i, /\bavoid\b/i],
];

/** Detect contradictions between instruction files. */
export function detectContradictions(
  instructionFiles: DirectiveInput[],
): Contradiction[] {
  if (instructionFiles.length < 2) return [];

  // Extract directives from all files
  const directives = extractDirectives(instructionFiles);
  if (directives.length < 2) return [];

  // Group by topic similarity
  const topicGroups = groupByTopic(directives);

  // Check each group for conflicts
  const contradictions: Contradiction[] = [];

  for (const group of topicGroups) {
    if (group.length < 2) continue;

    // Pairwise comparison within the group
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];

        // Skip directives from the same file
        if (a.path === b.path) continue;

        const conflict = detectConflict(a, b);
        if (conflict) {
          contradictions.push(conflict);
        }
      }
    }
  }

  return contradictions;
}

/** Extract directive-like statements from instruction files. */
function extractDirectives(files: DirectiveInput[]): ExtractedDirective[] {
  const directives: ExtractedDirective[] = [];

  for (const file of files) {
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines, headings, code blocks, comments
      if (!line || line.startsWith("#") || line.startsWith("```") || line.startsWith("<!--")) continue;

      // Check if this line contains a directive pattern
      if (DIRECTIVE_PATTERNS.some((p) => p.test(line))) {
        directives.push({
          text: line,
          path: file.path,
          depth: file.depth,
          line_number: i + 1,
        });
      }
    }
  }

  return directives;
}

/** Group directives by topic similarity using TF-IDF. */
function groupByTopic(directives: ExtractedDirective[]): ExtractedDirective[][] {
  const docs = directives.map((d) => tokenize(d.text));
  const idf = computeIdf(docs);
  const vectors = docs.map((doc) => tfidf(doc, idf));

  // Greedy clustering: assign each directive to the first group with sufficient similarity
  const groups: ExtractedDirective[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < directives.length; i++) {
    if (assigned.has(i)) continue;

    const group = [directives[i]];
    assigned.add(i);

    for (let j = i + 1; j < directives.length; j++) {
      if (assigned.has(j)) continue;

      const sim = cosineSimilarity(vectors[i], vectors[j]);
      if (sim >= TOPIC_SIMILARITY_THRESHOLD) {
        group.push(directives[j]);
        assigned.add(j);
      }
    }

    if (group.length > 1) {
      groups.push(group);
    }
  }

  return groups;
}

/** Check if two directives conflict. */
function detectConflict(
  a: ExtractedDirective,
  b: ExtractedDirective,
): Contradiction | null {
  // Check for opposing verbs
  for (const [verbA, verbB] of OPPOSING_VERBS) {
    const aMatchesFirst = verbA.test(a.text) && verbB.test(b.text);
    const aMatchesSecond = verbB.test(a.text) && verbA.test(b.text);

    if (aMatchesFirst || aMatchesSecond) {
      const classification = classifyConflict(a, b);
      return {
        file_a: a.path,
        file_b: b.path,
        directive_a: a.text,
        directive_b: b.text,
        line_a: a.line_number,
        line_b: b.line_number,
        topic: extractTopic(a.text, b.text),
        classification: classification.class,
        severity: classification.severity,
        explanation: buildExplanation(a, b, classification.class),
      };
    }
  }

  // Check for different values for same pattern (e.g., "use X" vs "use Y")
  const valueConflict = detectValueConflict(a, b);
  if (valueConflict) return valueConflict;

  return null;
}

/** Classify the conflict type based on file depths and content. */
function classifyConflict(
  a: ExtractedDirective,
  b: ExtractedDirective,
): { class: ConflictClass; severity: ConflictSeverity } {
  // If one is nested deeper than the other, it's a scope override
  if (a.depth !== b.depth) {
    return { class: "scope_override", severity: "warning" };
  }

  // Check if this is about tool/server overlap
  const mcpPattern = /\b(?:mcp|server|tool)\b/i;
  if (mcpPattern.test(a.text) && mcpPattern.test(b.text)) {
    return { class: "tool_overlap", severity: "info" };
  }

  // Same depth, opposing directives = hard conflict
  return { class: "hard_conflict", severity: "error" };
}

/** Detect conflicts where two directives prescribe different values for the same thing. */
function detectValueConflict(
  a: ExtractedDirective,
  b: ExtractedDirective,
): Contradiction | null {
  // Pattern: "Use X for Y" vs "Use Z for Y"
  const usePattern = /\buse\s+(\S+)\s+(?:for|when|in)\b/i;
  const matchA = usePattern.exec(a.text);
  const matchB = usePattern.exec(b.text);

  if (matchA && matchB) {
    const valueA = matchA[1].toLowerCase();
    const valueB = matchB[1].toLowerCase();

    // Different values for a similar directive
    if (valueA !== valueB) {
      // Check if the "for" clauses overlap
      const forPattern = /\b(?:for|when|in)\s+(.+?)(?:\.|$)/i;
      const forA = forPattern.exec(a.text)?.[1]?.toLowerCase();
      const forB = forPattern.exec(b.text)?.[1]?.toLowerCase();

      // Only flag if the scope/target is similar
      if (forA && forB) {
        const scopeTokensA = tokenize(forA);
        const scopeTokensB = tokenize(forB);
        const overlap = scopeTokensA.filter((t) => scopeTokensB.includes(t));
        if (overlap.length > 0) {
          const classification = classifyConflict(a, b);
          return {
            file_a: a.path,
            file_b: b.path,
            directive_a: a.text,
            directive_b: b.text,
            line_a: a.line_number,
            line_b: b.line_number,
            topic: extractTopic(a.text, b.text),
            classification: classification.class,
            severity: classification.severity,
            explanation: buildExplanation(a, b, classification.class),
          };
        }
      }
    }
  }

  return null;
}

/** Extract a topic label from two directives. */
function extractTopic(textA: string, textB: string): string {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  const common = tokensA.filter((t) => tokensB.includes(t));
  return common.slice(0, 3).join(" ") || "unknown";
}

/** Build a human-readable explanation. */
function buildExplanation(
  a: ExtractedDirective,
  b: ExtractedDirective,
  classification: ConflictClass,
): string {
  switch (classification) {
    case "hard_conflict":
      return `Conflicting directives at the same scope level: "${a.path}" and "${b.path}" give opposing guidance`;
    case "scope_override":
      return `"${b.depth > a.depth ? b.path : a.path}" overrides "${b.depth > a.depth ? a.path : b.path}" — may be intentional scope narrowing`;
    case "tool_overlap":
      return `"${a.path}" and "${b.path}" prescribe different tools for overlapping tasks`;
  }
}
