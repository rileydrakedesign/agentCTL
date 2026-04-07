import { parse as parseYaml } from "yaml";
import type { AgenticReference } from "../types.js";

/** Parse @lat: annotations from an instruction file's content. */
export function parseLatAnnotations(
  filePath: string,
  content: string,
): AgenticReference[] {
  const refs: AgenticReference[] = [];

  // Parse HTML comment annotations: <!-- @lat:type targets -->
  refs.push(...parseHtmlCommentAnnotations(filePath, content));

  // Parse YAML front-matter annotations
  refs.push(...parseFrontMatterAnnotations(filePath, content));

  return refs;
}

/** Parse <!-- @lat:refs foo.md, bar.md --> style annotations. */
function parseHtmlCommentAnnotations(
  filePath: string,
  content: string,
): AgenticReference[] {
  const refs: AgenticReference[] = [];
  const pattern = /<!--\s*@lat:(\w[\w-]*)\s+(.*?)\s*-->/g;
  const lines = content.split("\n");

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const annotationType = match[1];
    const targetsStr = match[2];
    const lineNumber = findLineNumber(content, match.index, lines);
    const context = match[0];

    const targets = targetsStr
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    for (const target of targets) {
      const ref = createLatReference(filePath, annotationType, target, lineNumber, context);
      if (ref) refs.push(ref);
    }
  }

  return refs;
}

/** Parse YAML front-matter with lat: key. */
function parseFrontMatterAnnotations(
  filePath: string,
  content: string,
): AgenticReference[] {
  const refs: AgenticReference[] = [];

  // Check for YAML front-matter (must start at beginning of file)
  if (!content.startsWith("---")) return refs;

  const endIndex = content.indexOf("---", 3);
  if (endIndex === -1) return refs;

  const yamlStr = content.slice(3, endIndex).trim();
  if (!yamlStr) return refs;

  let parsed: Record<string, unknown>;
  try {
    parsed = parseYaml(yamlStr) as Record<string, unknown>;
  } catch {
    return refs;
  }

  if (!parsed || typeof parsed !== "object") return refs;
  const lat = parsed["lat"] as Record<string, unknown> | undefined;
  if (!lat || typeof lat !== "object") return refs;

  // @lat:refs
  const latRefs = lat["refs"];
  if (Array.isArray(latRefs)) {
    for (const target of latRefs) {
      if (typeof target === "string") {
        const ref = createLatReference(filePath, "refs", target, 1, `lat.refs: ${target}`);
        if (ref) refs.push(ref);
      }
    }
  }

  // @lat:uses-mcp
  const latMcp = lat["uses-mcp"];
  if (Array.isArray(latMcp)) {
    for (const target of latMcp) {
      if (typeof target === "string") {
        const ref = createLatReference(filePath, "uses-mcp", target, 1, `lat.uses-mcp: ${target}`);
        if (ref) refs.push(ref);
      }
    }
  }

  // @lat:uses-skill
  const latSkill = lat["uses-skill"];
  if (Array.isArray(latSkill)) {
    for (const target of latSkill) {
      if (typeof target === "string") {
        const ref = createLatReference(filePath, "uses-skill", target, 1, `lat.uses-skill: ${target}`);
        if (ref) refs.push(ref);
      }
    }
  }

  return refs;
}

/** Create a lat annotation reference based on annotation type. */
function createLatReference(
  source: string,
  annotationType: string,
  target: string,
  lineNumber: number,
  context: string,
): AgenticReference | null {
  switch (annotationType) {
    case "refs":
      return {
        source,
        target,
        target_type: "instruction",
        reference_type: "lat_annotation",
        confidence: 1.0,
        context,
        line_number: lineNumber,
        verified: true, // Verification happens later in the pipeline
        category: "structural",
      };

    case "uses-mcp":
      return {
        source,
        target: `mcp:${target}`,
        target_type: "mcp",
        reference_type: "lat_annotation",
        confidence: 1.0,
        context,
        line_number: lineNumber,
        verified: true,
        category: "structural",
      };

    case "uses-skill":
      return {
        source,
        target: `skill:${target}`,
        target_type: "skill",
        reference_type: "lat_annotation",
        confidence: 1.0,
        context,
        line_number: lineNumber,
        verified: true,
        category: "structural",
      };

    // Metadata annotations don't create graph edges
    case "platform":
    case "scope":
    case "parent":
    case "deprecated":
      return null;

    default:
      return null;
  }
}

/** Find the 1-based line number for a character offset. */
function findLineNumber(content: string, offset: number, lines: string[]): number {
  let charCount = 0;
  for (let i = 0; i < lines.length; i++) {
    charCount += lines[i].length + 1; // +1 for newline
    if (charCount > offset) return i + 1;
  }
  return lines.length;
}
