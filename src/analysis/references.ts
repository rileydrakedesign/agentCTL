import { existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import type {
  AgenticReference,
  InstructionFile,
  ParsedSkill,
} from "../types.js";

// ── Entity Registry ─────────────────────────────────────────

interface EntityEntry {
  path: string;
  type: "instruction" | "skill" | "mcp" | "rules";
}

function buildEntityRegistry(
  instructionFiles: InstructionFile[],
  parsedSkills: ParsedSkill[],
  mcpServerNames: string[],
): Map<string, EntityEntry> {
  const registry = new Map<string, EntityEntry>();

  for (const file of instructionFiles) {
    // Register by full path
    registry.set(file.path, { path: file.path, type: "instruction" });
    // Register by filename without extension
    const baseName = file.path.split("/").pop()?.replace(/\.md$/i, "");
    if (baseName && !registry.has(baseName.toLowerCase())) {
      registry.set(baseName.toLowerCase(), { path: file.path, type: "instruction" });
    }
  }

  for (const skill of parsedSkills) {
    registry.set(skill.name.toLowerCase(), { path: skill.path, type: "skill" });
  }

  for (const name of mcpServerNames) {
    registry.set(name.toLowerCase(), { path: `mcp:${name}`, type: "mcp" });
  }

  return registry;
}

// ── Main Detection Function ─────────────────────────────────

/** Detect structural references between agentic entities from markdown content. */
export function detectStructuralReferences(
  instructionFiles: InstructionFile[],
  fileContents: Map<string, string>,
  parsedSkills: ParsedSkill[],
  mcpServerNames: string[],
  rootDir: string,
): AgenticReference[] {
  const registry = buildEntityRegistry(instructionFiles, parsedSkills, mcpServerNames);
  const allRefs: AgenticReference[] = [];
  const seen = new Set<string>();

  for (const [filePath, content] of fileContents) {
    const lines = content.split("\n");

    const refs = [
      ...parseExplicitPaths(lines, filePath, rootDir),
      ...parseWikiLinks(lines, filePath, registry),
      ...parseMcpMentions(lines, filePath, mcpServerNames),
      ...parseSkillMentions(lines, filePath, parsedSkills.map((s) => s.name)),
    ];

    // Deduplicate within file: same source->target keeps first (highest specificity)
    for (const ref of refs) {
      const key = `${ref.source}::${ref.target}`;
      if (!seen.has(key)) {
        seen.add(key);
        allRefs.push(ref);
      }
    }
  }

  return allRefs;
}

// ── Parsers ─────────────────────────────────────────────────

/** Detect explicit file path references in markdown content. */
function parseExplicitPaths(
  lines: string[],
  sourcePath: string,
  rootDir: string,
): AgenticReference[] {
  const refs: AgenticReference[] = [];
  // Match paths containing / and ending in known extensions
  // Handles backtick-wrapped, bare, and quoted paths
  const pathPattern = /(?:`([^`]*\/[^`]+\.(?:md|mdc|json|yaml|yml))`|(?:^|\s)(\.{0,2}\/\S+\.(?:md|mdc|json|yaml|yml)))/gi;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    pathPattern.lastIndex = 0;
    while ((match = pathPattern.exec(line)) !== null) {
      const rawPath = match[1] ?? match[2];
      if (!rawPath) continue;

      // Resolve relative to source file's directory
      const sourceDir = dirname(resolve(rootDir, sourcePath));
      const resolvedPath = resolve(sourceDir, rawPath);
      const relPath = relative(rootDir, resolvedPath);

      // Skip self-references
      if (relPath === sourcePath) continue;

      const verified = existsSync(resolvedPath);
      const targetType = inferTargetType(relPath);

      refs.push({
        source: sourcePath,
        target: relPath,
        target_type: targetType,
        reference_type: "explicit_path",
        confidence: 1.0,
        context: line.trim(),
        line_number: i + 1,
        verified,
        category: "structural",
      });
    }
  }

  return refs;
}

/** Detect [[wiki-style links]] in markdown content. */
function parseWikiLinks(
  lines: string[],
  sourcePath: string,
  registry: Map<string, EntityEntry>,
): AgenticReference[] {
  const refs: AgenticReference[] = [];
  const wikiPattern = /\[\[([^\]]+)\]\]/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    wikiPattern.lastIndex = 0;
    while ((match = wikiPattern.exec(line)) !== null) {
      const linkText = match[1].trim();
      const lookupKey = linkText.toLowerCase();

      const entity = registry.get(lookupKey);
      if (entity) {
        refs.push({
          source: sourcePath,
          target: entity.path,
          target_type: entity.type,
          reference_type: "wiki_link",
          confidence: 0.9,
          context: line.trim(),
          line_number: i + 1,
          verified: true,
          category: "structural",
        });
      } else {
        // Broken wiki link — target not found
        refs.push({
          source: sourcePath,
          target: linkText,
          target_type: "unknown",
          reference_type: "wiki_link",
          confidence: 1.0,
          context: line.trim(),
          line_number: i + 1,
          verified: false,
          category: "structural",
        });
      }
    }
  }

  return refs;
}

/** Detect MCP server name mentions in markdown content. */
function parseMcpMentions(
  lines: string[],
  sourcePath: string,
  mcpNames: string[],
): AgenticReference[] {
  if (mcpNames.length === 0) return [];

  const refs: AgenticReference[] = [];
  const found = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const name of mcpNames) {
      if (found.has(name)) continue;

      // Match backtick-wrapped: `github`
      const backtickPattern = new RegExp(`\`${escapeRegex(name)}\``, "i");
      // Match "the X server", "the X MCP", "X MCP server"
      const prosePattern = new RegExp(
        `(?:the\\s+${escapeRegex(name)}\\s+(?:server|MCP|mcp))|(?:${escapeRegex(name)}\\s+MCP\\s+server)`,
        "i",
      );

      if (backtickPattern.test(line) || prosePattern.test(line)) {
        found.add(name);
        refs.push({
          source: sourcePath,
          target: `mcp:${name}`,
          target_type: "mcp",
          reference_type: "mcp_name_mention",
          confidence: 1.0,
          context: line.trim(),
          line_number: i + 1,
          verified: true,
          category: "structural",
        });
      }
    }
  }

  return refs;
}

/** Detect skill name mentions in markdown content. */
function parseSkillMentions(
  lines: string[],
  sourcePath: string,
  skillNames: string[],
): AgenticReference[] {
  if (skillNames.length === 0) return [];

  const refs: AgenticReference[] = [];
  const found = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const name of skillNames) {
      if (found.has(name)) continue;

      // Match /skill-name pattern (slash command style)
      const slashPattern = new RegExp(`(?:^|\\s)\\/${escapeRegex(name)}(?:\\s|$|[.,;:!?])`, "i");
      // Match "the X skill" pattern
      const prosePattern = new RegExp(
        `the\\s+${escapeRegex(name)}\\s+skill`,
        "i",
      );

      if (slashPattern.test(line) || prosePattern.test(line)) {
        found.add(name);
        refs.push({
          source: sourcePath,
          target: `skill:${name}`,
          target_type: "skill",
          reference_type: "skill_name_mention",
          confidence: 1.0,
          context: line.trim(),
          line_number: i + 1,
          verified: true,
          category: "structural",
        });
      }
    }
  }

  return refs;
}

// ── Utilities ───────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferTargetType(path: string): AgenticReference["target_type"] {
  const lower = path.toLowerCase();
  if (lower.endsWith(".mdc")) return "rules";
  if (lower.endsWith(".md")) {
    if (lower.includes("skill")) return "skill";
    return "instruction";
  }
  return "file";
}
