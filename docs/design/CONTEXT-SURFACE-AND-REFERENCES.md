# Context Surface & Reference Graph — Infrastructure Specification

> Status: Brainstorm / RFC
> Date: 2026-04-06
> Companion to: [SOLAR-SYSTEM-DASHBOARD.md](./SOLAR-SYSTEM-DASHBOARD.md)

## Overview

This document specifies two new core systems for agentctl:

1. **Context Surface Model** — a platform-aware representation of everything
   visible to an AI agent at session start
2. **Reference Graph** — a three-layer system for detecting and classifying
   relationships between agentic infrastructure components

These systems power both the CLI (connectivity analysis, CI gates) and the
dashboard (planet rendering, reference arc visualization).

---

## Table of Contents

1. [Context Surface Model](#1-context-surface-model)
2. [Reference Graph System](#2-reference-graph-system)
3. [Structural References](#3-structural-references)
4. [Semantic References](#4-semantic-references)
5. [Lat Annotations](#5-lat-annotations)
6. [Reference Detection Pipeline](#6-reference-detection-pipeline)
7. [Core Types](#7-core-types)
8. [CLI Integration](#8-cli-integration)
9. [Dashboard Mapping](#9-dashboard-mapping)
10. [Open Questions & Future Work](#10-open-questions--future-work)

---

## 1. Context Surface Model

The **context surface** is the totality of everything injected into an AI agent's
context at session start. This is what the planet represents in the solar system
visualization — not a single file, but a composite.

### 1.1 What Constitutes the Context Surface

The context surface is **platform-dependent**. The same project produces different
surfaces depending on which agent runtime is analyzing it.

#### Always Present (Core Surface)

These elements exist across all agent platforms:

| Layer | Source | Discovery Method |
|-------|--------|-----------------|
| Root instructions | CLAUDE.md, AGENTS.md at project root | File existence check |
| Parent instructions | CLAUDE.md files up directory tree to git root | Walk upward from cwd |
| MCP tool definitions | Tool name + schema from all configured servers | MCP scan (`tools/list`) |
| Project config | agentctl.yaml, runtime targets | Config parser |

#### Platform-Specific Layers

| Layer | Platform | Source | Discovery |
|-------|----------|--------|-----------|
| .mdc rules | Cursor | `.cursor/rules/*.mdc` (glob-matched) | Glob + parse front-matter |
| .cursorrules | Cursor | `.cursorrules` at root | File existence |
| .windsurfrules | Windsurf | `.windsurfrules` at root | File existence |
| Custom instructions | Claude Code | `.claude/settings.json` → `customInstructions` | JSON parse |
| Auto-loaded skills | Claude Code | `skills/`, `.skills/`, `.claude/skills/` | Directory scan |
| Hook output | Claude Code | SessionStart hooks in settings | Hook config parse |
| .claude/ configs | Claude Code | `.claude/settings.json`, `.claude/commands/` | Directory scan |

#### Conditionally Activated (Outer Surface)

These are part of the project's agentic layer but only enter context under
specific conditions:

| Layer | Activation Trigger |
|-------|-------------------|
| .mdc files with glob patterns | Only when matching files are open/active |
| On-demand skills | Invoked explicitly, not pre-loaded |
| Nested instruction files | Loaded based on working directory depth |
| Tool-specific context | MCP tool descriptions only when tool is called |

### 1.2 Surface Composition

The context surface has a measurable composition — a breakdown of token weight
by layer type:

```
┌──────────────────────────────────────────────────┐
│              Context Surface (Planet)             │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  Core: Root instructions        (35%)    │    │
│  ├──────────────────────────────────────────┤    │
│  │  Core: MCP tool definitions     (40%)    │    │
│  ├──────────────────────────────────────────┤    │
│  │  Core: Auto-loaded skills       (10%)    │    │
│  ├──────────────────────────────────────────┤    │
│  │  Platform: Rules files          (8%)     │    │
│  ├──────────────────────────────────────────┤    │
│  │  Platform: Custom instructions  (5%)     │    │
│  ├──────────────────────────────────────────┤    │
│  │  Platform: Hook output          (2%)     │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  Total: 45,230 tokens / 200,000 context window   │
│  Pressure: 22.6%                                 │
└──────────────────────────────────────────────────┘
```

### 1.3 Platform Profiles

Each agent platform has a **profile** that defines what it discovers:

```typescript
interface PlatformProfile {
  name: "claude-code" | "cursor" | "windsurf" | "generic";
  root_instruction_files: string[];     // filenames to look for at root
  rules_patterns: string[];             // glob patterns for rules files
  skill_directories: string[];          // where to find skills
  config_files: string[];               // platform-specific configs
  supports_hooks: boolean;
  supports_mdc: boolean;
  supports_custom_instructions: boolean;
}
```

Default profiles:

**Claude Code:** `CLAUDE.md`, `AGENTS.md`, parent directory walk,
`.claude/settings.json`, skills dirs, hooks, MCP via `.mcp.json`

**Cursor:** `.cursorrules`, `.cursor/rules/*.mdc`, MCP via `.cursor/mcp.json`
or project config

**Windsurf:** `.windsurfrules`, MCP via project config

**Generic:** Union of all known patterns (broadest discovery)

---

## 2. Reference Graph System

The reference graph maps how agentic infrastructure components relate to each
other. It answers: "Is everything connected? Are there orphans? How does context
flow through this project?"

### 2.1 Three-Layer Detection

References are detected through three distinct mechanisms, each with different
confidence levels and parse strategies:

```
Layer 1: Lat Annotations        (highest confidence, explicit authorship)
   │     @lat:refs, @lat:uses-mcp, @lat:uses-skill
   │     User-declared, machine-parseable, verifiable
   │
Layer 2: Structural References   (high confidence, pattern-matched)
   │     [[wiki links]], explicit file paths, glob patterns
   │     Parseable from content, verifiable against filesystem
   │
Layer 3: Semantic References     (variable confidence, inferred)
         "follow auth patterns" → auth-patterns.md
         Natural language fuzzy-matched against known entities
```

Each layer operates independently. Results are merged into a unified graph
with confidence scores per edge.

### 2.2 Graph Structure

The reference graph is a **directed graph** where:
- **Nodes** = agentic entities (instruction files, skills, MCP servers, rules files)
- **Edges** = references between entities (with type, confidence, source location)
- **Root** = the context surface (not a single file, but the composite surface)

Connectivity is measured from the root outward:
- **Linked** = reachable from the context surface through any chain of references
- **Unlinked** = no path from the context surface to this node
- **Degree** = shortest path length from context surface to this node

### 2.3 Connectivity Scoring

```
connectivity_pct = linked_nodes / total_nodes × 100

health interpretation:
  90-100%  = excellent — nearly everything is connected
  70-89%   = good — some orphans, review recommended
  50-69%   = concerning — significant orphaned infrastructure
  <50%     = poor — most agentic infrastructure is disconnected
```

Connectivity percentage becomes a first-class metric alongside token budget,
waste percentage, and context pressure. It answers a question the other metrics
don't: "Is your agentic infrastructure actually coherent?"

---

## 3. Structural References

Structural references are **explicit, machine-parseable, and verifiable**. They
can be validated: does the target exist? Is the path correct?

### 3.1 Supported Patterns

#### Explicit File Paths

References to files by path within markdown content:

```markdown
See `src/api/CLAUDE.md` for API-specific instructions.
Follow the patterns in ./auth/instructions.md.
Reference: ../shared/CLAUDE.md
```

**Detection:** Regex for path-like patterns (containing `/` or `\`, ending in
known extensions: `.md`, `.mdc`, `.json`, `.yaml`). Resolve relative to the
source file's directory. Verify existence.

#### Wiki-Style Links (IWE Links)

Double-bracket links inspired by wiki/Obsidian syntax:

```markdown
Follow the patterns in [[auth-patterns]].
See [[skills/deploy]] for deployment automation.
This uses the [[github]] MCP server.
```

**Resolution order:**
1. Exact match against known entity names (instruction files, skills, MCP servers)
2. Fuzzy filename match (e.g., `[[auth-patterns]]` → `auth-patterns.md`)
3. Path match (e.g., `[[skills/deploy]]` → `skills/deploy/SKILL.md`)

Wiki links serve double duty — they're structural references that are also
human-readable. Projects that adopt this convention get better connectivity
detection for free.

#### Glob Pattern References (.mdc files)

Cursor .mdc files use glob patterns in their front-matter to declare which
files they apply to:

```markdown
---
description: API route conventions
globs: src/api/**/*.ts, src/routes/**/*.ts
---
```

These create structural references from the .mdc file to the matched file
patterns. The reference is to a pattern, not a specific file, but it's still
structural and verifiable.

#### MCP Server Name References

When an instruction file mentions an MCP server by its configured name:

```markdown
Use the `github` server for all PR operations.
The filesystem MCP provides file access.
```

**Detection:** Match against known MCP server names from `.mcp.json` discovery.
Exact name matches within backticks or after known prefixes ("the X server",
"the X MCP", "X MCP server").

#### Skill Invocation References

When instruction files reference skills by name:

```markdown
Run the `/deploy` skill after code review.
Use the code-review skill for all PRs.
```

**Detection:** Match `/skill-name` patterns and "the X skill" patterns against
discovered skill names.

### 3.2 Structural Reference Confidence

All structural references start at **confidence: 1.0** but can be downgraded:

| Condition | Confidence |
|-----------|-----------|
| Target exists and resolves cleanly | 1.0 |
| Target matches by fuzzy filename (wiki link) | 0.9 |
| Target matches by pattern (glob) | 0.85 |
| Target doesn't exist (broken reference) | 1.0 (still structural, but flagged as broken) |

Broken structural references are important — they indicate that someone intended
a connection but the target is missing. The dashboard shows these as red broken
arcs.

---

## 4. Semantic References

Semantic references are **implicit, inferred from natural language, and
probabilistic**. They require matching prose against known entity names and
descriptions.

### 4.1 Detection Strategy

Semantic detection runs after structural detection. It operates on text that
was NOT already matched as a structural reference. This avoids double-counting.

**Process:**
1. Tokenize all .md file content into sentences/phrases
2. For each known entity (instruction file, skill, MCP server):
   - Generate match candidates from the entity name, path, and description
   - Score each sentence against candidates using token overlap + proximity
3. Filter by confidence threshold (default: 0.5)

### 4.2 Match Candidate Generation

For each entity, generate a set of match terms:

```
Entity: auth-patterns.md
  Candidates: "auth patterns", "auth", "authentication patterns",
              "authentication", "auth guidelines"

Entity: MCP server "github"
  Candidates: "github", "github server", "PR operations",
              "issue management" (from tool descriptions)

Entity: skill "deploy"
  Candidates: "deploy", "deployment", "deploy skill",
              "deployment automation" (from SKILL.md description)
```

### 4.3 Scoring

```
semantic_score = term_overlap × proximity_boost × specificity_weight

term_overlap:      % of candidate terms present in the source text
proximity_boost:   1.0-1.5x based on how close matched terms are to each other
specificity_weight: penalize generic terms ("the", "use"), boost specific ones
```

### 4.4 Confidence Tiers

| Score Range | Confidence | Dashboard Treatment |
|-------------|-----------|---------------------|
| 0.8 - 1.0 | High | Dashed line, visible on click |
| 0.5 - 0.79 | Medium | Faint dashed line, visible on click with label |
| 0.3 - 0.49 | Low | Faint dotted line, only in "show all" mode |
| < 0.3 | Rejected | Not included in graph |

### 4.5 Examples

```markdown
# CLAUDE.md

Follow the auth patterns established in this project.
```

If `auth-patterns.md` exists:
- "auth patterns" matches entity name "auth-patterns" → score ~0.85
- Reference created: CLAUDE.md → auth-patterns.md, semantic, confidence 0.85

```markdown
# CLAUDE.md

Use the same error handling approach throughout the codebase.
```

If `error-handling.md` exists:
- "error handling" matches entity name "error-handling" → score ~0.75
- Reference created: CLAUDE.md → error-handling.md, semantic, confidence 0.75

If no `error-handling.md` exists:
- No match, no reference created

---

## 5. Lat Annotations

Lat (lattice) annotations are an **explicit, authored** layer of reference
declarations embedded within existing .md files. They provide the highest
confidence references because the user is deliberately declaring relationships.

### 5.1 Format

Lat annotations use HTML comments so they're invisible in rendered markdown
but machine-parseable:

```markdown
<!-- @lat:refs auth-patterns.md, ../shared/types.md -->
<!-- @lat:uses-mcp github, filesystem -->
<!-- @lat:uses-skill deploy, code-review -->
<!-- @lat:platform claude-code -->
```

They can also appear in YAML front-matter:

```markdown
---
lat:
  refs:
    - auth-patterns.md
    - ../shared/types.md
  uses-mcp:
    - github
    - filesystem
  uses-skill:
    - deploy
    - code-review
  platform: claude-code
---
```

### 5.2 Annotation Types

| Annotation | Meaning | Target Type |
|-----------|---------|-------------|
| `@lat:refs <paths>` | This file references these other files | instruction, file |
| `@lat:uses-mcp <names>` | This file depends on these MCP servers | mcp |
| `@lat:uses-skill <names>` | This file references these skills | skill |
| `@lat:platform <name>` | This file is specific to this platform | metadata |
| `@lat:scope <glob>` | This file applies when these globs match | metadata |
| `@lat:parent <path>` | This file inherits from / extends this file | instruction |
| `@lat:deprecated` | This file is deprecated (visual treatment in dashboard) | metadata |

### 5.3 Lat Annotations vs. IWE Links

Both are structural, but they serve different purposes:

| | Lat Annotations | IWE/Wiki Links |
|---|---|---|
| **Location** | Front-matter or HTML comments | Inline in prose |
| **Visibility** | Hidden in rendered markdown | Visible to human readers |
| **Purpose** | Machine-readable dependency declaration | Human + machine readable reference |
| **Granularity** | File-level declarations | Paragraph-level references |
| **Authoring** | Intentional infrastructure mapping | Natural writing flow |

A well-maintained project might use both: lat annotations for the formal
dependency graph, wiki links for inline cross-references in the prose.

### 5.4 Auto-Generation

agentctl should be able to **generate** a starter set of lat annotations from
its structural and semantic reference detection:

```bash
agentctl lattice generate          # scan and propose annotations
agentctl lattice generate --apply  # write annotations into files
agentctl lattice validate          # check existing annotations
agentctl lattice diff              # show what changed since last generation
```

The workflow:
1. Run `agentctl lattice generate` → prints proposed annotations per file
2. User reviews and edits
3. Run `agentctl lattice generate --apply` → writes annotations into files
4. Lat annotations become the **source of truth** for the reference graph
5. Structural and semantic detection still run, but lat annotations take
   precedence when they exist

### 5.5 Lattice File (Alternative to Inline Annotations)

For projects that prefer a centralized manifest over inline annotations,
a `.lat.md` or `.claude/lattice.md` file can serve as the single source:

```markdown
# Project Lattice

## Instructions
- [[CLAUDE.md]] → refs: [[auth-patterns.md]], [[error-handling.md]]
- [[CLAUDE.md]] → uses-mcp: [[github]], [[filesystem]]
- [[src/api/CLAUDE.md]] → refs: [[../CLAUDE.md]], [[api-conventions.md]]
- [[src/api/CLAUDE.md]] → uses-mcp: [[postgres]]

## Skills
- [[skills/deploy/SKILL.md]] → uses-mcp: [[github]], [[aws]]
- [[skills/review/SKILL.md]] → uses-mcp: [[github]]

## Rules
- [[.cursor/rules/api.mdc]] → scope: src/api/**/*.ts
- [[.cursor/rules/testing.mdc]] → scope: tests/**/*.ts
```

When a lattice file exists, it is parsed as the primary reference source.
Inline lat annotations supplement it. The two approaches are complementary.

---

## 6. Reference Detection Pipeline

### 6.1 Pipeline Stages

```
Stage 1: Discovery
│  Discover all agentic entities (instructions, skills, MCPs, rules)
│  Build entity registry with names, paths, descriptions
│
Stage 2: Lat Annotation Parse
│  Scan all .md files for @lat: annotations (HTML comments + front-matter)
│  Parse lattice file if present (.lat.md / .claude/lattice.md)
│  Create edges with confidence: 1.0, type: "lat_annotation"
│  Validate: does each target exist?
│
Stage 3: Structural Reference Scan
│  Scan all .md file content for:
│    - Explicit file paths → resolve, verify existence
│    - Wiki links [[target]] → resolve against entity registry
│    - MCP server name mentions → match against known servers
│    - Skill name mentions → match against known skills
│    - Glob patterns (in .mdc front-matter) → record pattern
│  Create edges with confidence: 0.85-1.0, type per pattern
│  Skip text regions already matched by lat annotations
│
Stage 4: Semantic Reference Scan
│  For remaining unmatched text:
│    - Generate match candidates per entity
│    - Score sentences against candidates
│    - Filter by confidence threshold (default: 0.5)
│  Create edges with confidence: 0.3-1.0, type: "semantic_mention"
│  Skip text regions already matched by structural scan
│
Stage 5: Graph Construction
│  Merge all edges into directed graph
│  Deduplicate (same source→target keeps highest-confidence edge)
│  Compute connectivity from context surface root:
│    - BFS from surface nodes
│    - Mark each node: linked/unlinked, degree, reference chain
│  Calculate summary metrics
│
Stage 6: Output
   Write topology.json artifact
   Include in plan report
   Serve to dashboard via API
```

### 6.2 Deduplication & Precedence

When multiple detection layers find the same relationship:

1. **Lat annotation wins** — if `@lat:refs auth-patterns.md` exists AND a
   semantic match finds "follow auth patterns" → auth-patterns.md, keep only
   the lat annotation edge.

2. **Structural wins over semantic** — if `[[auth-patterns]]` wiki link exists
   AND semantic detection also finds the relationship, keep the structural edge.

3. **Highest confidence wins** — within the same layer, keep the edge with
   the highest confidence score.

### 6.3 Incremental Updates

For the dashboard's live monitoring mode, the pipeline supports incremental
re-detection:

- File changed → re-scan only that file's outgoing references
- MCP server added/removed → update entity registry, re-scan all files for
  mentions of new/removed server name
- Lat annotation changed → re-parse that file's annotations, update graph
- Full re-scan only when explicitly requested or on major changes

---

## 7. Core Types

### 7.1 Context Surface Types

```typescript
/** Platform profile for context surface discovery. */
interface PlatformProfile {
  name: "claude-code" | "cursor" | "windsurf" | "generic";
  root_instruction_files: string[];
  rules_patterns: string[];
  skill_directories: string[];
  config_files: string[];
  supports_hooks: boolean;
  supports_mdc: boolean;
  supports_custom_instructions: boolean;
}

/** A single layer contributing to the context surface. */
interface SurfaceLayer {
  layer_type:
    | "root_instruction"
    | "parent_instruction"
    | "rules_file"
    | "mcp_tool_definitions"
    | "skill"
    | "custom_instructions"
    | "hook_output"
    | "ide_config"
    | "project_config";
  source_path: string;          // file or config that contributes this layer
  token_count: number;
  platform: string;             // which platform profile discovered this
  always_present: boolean;      // core surface vs. conditionally activated
  activation_condition?: string; // e.g., glob pattern, working dir condition
}

/** The complete context surface for a project. */
interface ContextSurface {
  platform: PlatformProfile["name"];
  layers: SurfaceLayer[];
  total_tokens: number;
  core_tokens: number;          // always-present layers only
  conditional_tokens: number;   // conditionally-activated layers
  composition: Record<SurfaceLayer["layer_type"], {
    count: number;
    tokens: number;
    percentage: number;
  }>;
  pressure: {
    model: string;
    context_window: number;
    surface_pct: number;        // total_tokens / context_window
    remaining_tokens: number;
  };
}
```

### 7.2 Reference Types

```typescript
/** How a reference was detected. */
type ReferenceType =
  | "lat_annotation"      // @lat:refs, @lat:uses-mcp, etc.
  | "lat_file"            // from .lat.md / lattice file
  | "wiki_link"           // [[target]]
  | "explicit_path"       // ./path/to/file.md
  | "glob_match"          // .mdc front-matter glob pattern
  | "mcp_name_mention"    // "the github server"
  | "skill_name_mention"  // "the deploy skill", "/deploy"
  | "semantic_mention";   // fuzzy NLP match

/** A single reference between two agentic entities. */
interface AgenticReference {
  source: string;                 // file path of the referencing file
  target: string;                 // target path or entity name
  target_type: "instruction" | "skill" | "mcp" | "rules" | "file" | "unknown";
  reference_type: ReferenceType;
  confidence: number;             // 0.0-1.0
  context: string;                // the line/annotation containing the reference
  line_number?: number;
  verified: boolean;              // does the target actually exist?
  category: "structural" | "semantic";
}
```

### 7.3 Graph Types

```typescript
/** Connectivity status of a single node in the reference graph. */
interface ConnectivityStatus {
  object_id: string;              // file path or MCP server name
  object_type: "instruction" | "skill" | "mcp" | "rules";
  linked: boolean;
  degrees_from_surface: number | null;  // null if unlinked
  reference_chain: string[];            // shortest path from surface
  referenced_by: AgenticReference[];    // incoming edges
  references: AgenticReference[];       // outgoing edges
  structural_ref_count: number;
  semantic_ref_count: number;
}

/** The complete reference graph for a project. */
interface ReferenceGraph {
  context_surface_nodes: string[];      // nodes that ARE the context surface
  nodes: ConnectivityStatus[];
  edges: AgenticReference[];
  broken_references: AgenticReference[]; // structural refs where target missing
  summary: {
    total_nodes: number;
    linked_nodes: number;
    unlinked_nodes: number;
    connectivity_pct: number;
    max_depth: number;
    structural_edges: number;
    semantic_edges: number;
    lat_edges: number;
    broken_edges: number;
  };
}
```

### 7.4 Rules File Type (New)

```typescript
/** A rules file (.mdc, .cursorrules, .windsurfrules). */
interface RulesFile {
  path: string;
  platform: "cursor" | "windsurf" | "generic";
  token_count: number;
  glob_patterns?: string[];       // .mdc front-matter globs
  description?: string;           // .mdc front-matter description
  always_active: boolean;         // true if no glob restriction
}
```

---

## 8. CLI Integration

### 8.1 New Artifacts

| Artifact | Content | When Written |
|----------|---------|-------------|
| `surface.json` | ContextSurface for current platform | `plan`, `workspace` |
| `topology.json` | ReferenceGraph with all edges + nodes | `plan`, `workspace` |

### 8.2 Plan Report Integration

The plan report gains new sections:

```typescript
interface PlanReport {
  // ... existing fields ...

  // NEW
  context_surface: ContextSurface;
  reference_graph: {
    connectivity_pct: number;
    linked: number;
    unlinked: number;
    broken_references: number;
    unlinked_entities: string[];     // names/paths of orphaned objects
  };
}
```

### 8.3 New CLI Flags

```bash
# Fail if connectivity drops below threshold
agentctl plan --fail-on-connectivity 80

# Fail if any agentic files are unlinked/orphaned
agentctl plan --fail-on-unlinked

# Fail if broken structural references exist
agentctl plan --fail-on-broken-refs

# Specify platform for context surface analysis
agentctl plan --platform cursor
agentctl plan --platform claude-code   # default

# Show reference graph in workspace command
agentctl workspace --refs
agentctl workspace --refs --semantic    # include semantic refs

# Lattice management
agentctl lattice generate              # propose annotations
agentctl lattice generate --apply      # write into files
agentctl lattice validate              # check existing annotations
```

### 8.4 Terminal Output

The workspace command with `--refs` shows a reference tree:

```
📎 Reference Graph (connectivity: 87%)

  CLAUDE.md (surface)
  ├── → auth-patterns.md (structural: wiki link, line 12)
  │     └── → postgres MCP (semantic: "auth queries", confidence: 0.78)
  ├── → src/api/CLAUDE.md (structural: explicit path, line 24)
  │     ├── → api-conventions.md (structural: wiki link, line 5)
  │     └── → github MCP (lat: @lat:uses-mcp, line 2)
  ├── → skills/deploy (lat: @lat:uses-skill, line 3)
  │     └── → aws MCP (structural: name mention, line 18)
  └── → github MCP (structural: name mention, line 31)

  ⚠ Unlinked:
    • error-handling.md (instruction, 340 tokens)
    • skills/review (skill, 280 tokens)
    • redis MCP (server, 12 tools, 1,840 tokens)
```

---

## 9. Dashboard Mapping

### 9.1 Context Surface → Planet

The context surface maps to planet visual properties:

| Surface Property | Planet Visual |
|-----------------|---------------|
| total_tokens | Planet size (radius) |
| composition breakdown | Surface terrain bands / geological strata |
| core_tokens vs. conditional_tokens | Solid core vs. shimmering outer shell |
| connectivity_pct | Surface detail richness |
| pressure.surface_pct | Atmosphere density |
| platform | Planet color palette / texture family |

### 9.2 Reference Arcs → Visual Arcs

| Reference Property | Arc Visual |
|-------------------|------------|
| category: structural | Solid line |
| category: semantic | Dashed line |
| reference_type: lat_annotation | Bright solid, labeled with annotation |
| confidence | Line opacity (higher = more opaque) |
| verified: false (broken) | Red, broken/jagged line with warning icon |
| degrees_from_surface | Arc length / curvature |

### 9.3 Connectivity → Object State

| Connectivity | Visual Treatment |
|-------------|-----------------|
| linked, degree 1 | Close orbit, bright, stable |
| linked, degree 2+ | Further orbit, slightly dimmer |
| unlinked | Dim, transparent, wobbling, drifting outward |
| broken reference source | Pulsing warning glow on the source object |

---

## 10. Open Questions & Future Work

### Detection Quality

1. **Semantic detection accuracy** — How do we measure false positive rate?
   Consider a "feedback" mode where users confirm/reject semantic matches to
   train project-specific thresholds.

2. **Cross-language references** — Should we detect references in non-.md files?
   E.g., a TypeScript file that imports from a path mentioned in CLAUDE.md.
   Probably out of scope for v1.

3. **Reference direction ambiguity** — "See auth-patterns.md" is clearly
   outgoing. But "This file is used by the API layer" is incoming. Semantic
   detection needs to handle directionality.

### Lat Annotations

4. **Adoption friction** — Will users actually write lat annotations? The
   auto-generation workflow is critical. Make it zero-effort to start.

5. **Annotation drift** — Annotations can go stale. `agentctl lattice validate`
   should warn when annotations reference deleted files or when new files exist
   that aren't annotated.

6. **Lattice file vs. inline** — Should we recommend one approach? Lattice file
   is easier to review in PRs. Inline annotations stay close to the code. Maybe
   recommend lattice for small projects, inline for large ones.

### Platform Support

7. **Platform detection** — Can we auto-detect which platform is being used?
   Presence of `.cursor/` directory → Cursor profile. Presence of `.claude/` →
   Claude Code. Both → offer switching.

8. **Platform-specific context surface accuracy** — We need to verify exactly
   what each platform injects. This may require testing against actual IDE
   behavior, not just documentation.

### Scale

9. **Large monorepos** — Projects with 100+ instruction files. The reference
   graph could become expensive to compute. Consider caching, incremental
   updates, and a max-depth setting for semantic detection.

10. **Cross-project references** — In a workspace, can project A's instructions
    reference project B's MCP servers? This becomes relevant in Phase 2
    (multi-project workspaces).
