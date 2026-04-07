# Context Surface & Reference Graph — Infrastructure Specification

> Status: Brainstorm / RFC
> Date: 2026-04-06
> Companion to: [SOLAR-SYSTEM-DASHBOARD.md](./SOLAR-SYSTEM-DASHBOARD.md)

## Overview

This document specifies new core systems for agentctl:

1. **Context Surface Model** — a platform-aware representation of everything
   visible to an AI agent at session start
2. **Reference Graph** — a three-layer system for detecting and classifying
   relationships between agentic infrastructure components
3. **Contradiction Detection** — analysis of conflicting directives across
   instruction files (distinct from redundancy detection, which finds sameness)
4. **Staleness Detection** — identification of references and directives that
   have drifted from the current state of the project

These systems power both the CLI (connectivity analysis, CI gates) and the
dashboard (planet rendering, reference arc visualization).

**Inspiration:** The reference graph and lattice concepts share DNA with
Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
pattern — the idea that connections between documents are as valuable as
the documents themselves, and that the tedious bookkeeping of maintaining
cross-references is exactly what tooling should automate.

---

## Table of Contents

1. [Context Surface Model](#1-context-surface-model)
2. [Reference Graph System](#2-reference-graph-system)
3. [Structural References](#3-structural-references)
4. [Semantic References](#4-semantic-references)
5. [Lat Annotations](#5-lat-annotations)
6. [Reference Detection Pipeline](#6-reference-detection-pipeline)
7. [Contradiction Detection](#7-contradiction-detection)
8. [Staleness Detection](#8-staleness-detection)
9. [Core Types](#9-core-types)
10. [CLI Integration](#10-cli-integration)
11. [Dashboard Mapping](#11-dashboard-mapping)
12. [Open Questions & Future Work](#12-open-questions--future-work)

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

### 5.4.1 The Compounding Lattice

The lattice is a **compounding artifact** — it gets richer and more accurate
over time through a feedback loop:

```
Round 1: agentctl discovers files, proposes lattice from structural/semantic
         detection. Connectivity: 40%. Many uncertain semantic matches.

Round 2: User validates, adds lat annotations for confirmed relationships,
         rejects false positives. Lat annotations become ground truth.
         Connectivity: 65%.

Round 3: New files added to project. agentctl proposes additions to lattice.
         Existing lat annotations improve semantic matching (known entity
         relationships reduce ambiguity). Connectivity: 78%.

Round N: Lattice is comprehensive. New files are automatically placed in
         context via existing reference chains. Semantic detection is highly
         accurate because lat annotations provide rich training signal.
```

Each round of detection → user validation → annotation makes future detection
more accurate. The lattice compounds because:
- Lat annotations provide ground truth that disambiguates semantic matches
- A well-connected graph has fewer orphans, so new files are more likely to
  find an existing connection
- `agentctl lattice diff` shows evolution between git refs, making the
  compounding visible over time

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
Stage 6: Contradiction Analysis
│  Extract directives from all instruction files in the graph
│  Generate topic fingerprints per directive
│  Pairwise comparison of directives sharing topic fingerprints
│  Classify: hard_conflict / scope_override / tool_overlap
│  (See Section 7 for full specification)
│
Stage 7: Staleness Analysis
│  Tier 1: Already covered — broken refs flagged in Stages 2-3
│  Tier 2: Expand .mdc glob patterns, check for zero matches
│           Verify skill directory paths exist
│  Tier 3 (opt-in): Cross-reference directives against codebase
│           Package mentions vs. package.json
│           Env var mentions vs. .env.example
│  (See Section 8 for full specification)
│
Stage 8: Output
   Write topology.json artifact (graph + contradictions + staleness)
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

## 7. Contradiction Detection

Existing analysis modules detect **redundancy** (same thing said twice across MCP
servers) and **dead capabilities** (broken/empty tools). Contradiction detection
is a distinct axis: it finds **conflicting directives** across instruction files.

This matters because an agent receiving contradictory instructions behaves
unpredictably. The conflict may be invisible to the developer because each file
looks correct in isolation — the problem only emerges when you view the full
instruction set together.

### 7.1 What Contradictions Look Like

**Direct conflicts** — opposing directives on the same topic:

```
CLAUDE.md:           "Always use REST APIs for external services"
src/api/CLAUDE.md:   "Use GraphQL for all API endpoints"

CLAUDE.md:           "Use Jest for all testing"
.cursor/rules/test.mdc: "Use Vitest for all test files"

CLAUDE.md:           "Never commit directly to main"
.claude/settings.json:  "Auto-push to main after commit"
```

**Scope conflicts** — a nested instruction overrides a root instruction without
acknowledging it:

```
CLAUDE.md:                "Use TypeScript strict mode everywhere"
src/legacy/CLAUDE.md:     "Use JavaScript for files in this directory"
                          (valid override, but is it intentional?)
```

**Tool conflicts** — instructions reference MCP tools that have overlapping
capabilities with contradictory usage guidance:

```
CLAUDE.md:  "Use the filesystem MCP for all file operations"
CLAUDE.md:  "Use the shell MCP to read and write files"
```

### 7.2 Detection Strategy

Contradiction detection runs AFTER the reference graph is built, because it
needs to know which files are in the context surface and how they relate.

**Phase 1: Topic Extraction**

Extract directive-like statements from instruction files. Directives are
sentences/paragraphs that contain imperative language:
- "Always/never/use/avoid/prefer/do not..."
- "When X, do Y"
- "For X files, use Y"
- Rule-like patterns with clear prescriptive intent

Each directive gets a **topic fingerprint** — a normalized representation of
what it's about (e.g., "testing framework", "API style", "file operations").

**Phase 2: Pairwise Comparison**

For directives sharing a similar topic fingerprint, check for conflict:
- Opposing verbs: "use X" vs. "avoid X", "always" vs. "never"
- Different values for the same parameter: "use Jest" vs. "use Vitest"
- Contradictory conditions: same trigger, different prescribed actions

**Phase 3: Scope-Aware Filtering**

Not all conflicts are problems. A nested instruction file is ALLOWED to override
a root instruction for its scope. The system classifies each conflict:

| Classification | Meaning | Severity |
|---------------|---------|----------|
| `hard_conflict` | Same scope level, opposing directives | error |
| `scope_override` | Nested file overrides parent (possibly intentional) | warning |
| `tool_overlap` | Multiple tools prescribed for same task | info |

### 7.3 Relationship to Existing Analysis

| Module | Axis | Entities Compared |
|--------|------|-------------------|
| `redundancy.ts` | Sameness between MCP **tools** | Tool descriptions across servers |
| `dead-caps.ts` | Brokenness of MCP **tools** | Individual tool schemas |
| `pressure.ts` | Budget overrun of **token counts** | Totals vs. context windows |
| **contradictions** (new) | Conflict between **instructions** | Directive text across .md files |

This is a fundamentally different analysis dimension. Redundancy asks "are two
tools the same?" Contradiction asks "do two instructions disagree?"

### 7.4 Output Type

```typescript
type ConflictSeverity = "error" | "warning" | "info";
type ConflictClass = "hard_conflict" | "scope_override" | "tool_overlap";

interface Contradiction {
  file_a: string;           // path to first instruction file
  file_b: string;           // path to second instruction file
  directive_a: string;      // the conflicting text from file A
  directive_b: string;      // the conflicting text from file B
  line_a?: number;
  line_b?: number;
  topic: string;            // normalized topic fingerprint
  classification: ConflictClass;
  severity: ConflictSeverity;
  explanation: string;      // human-readable description of the conflict
}
```

---

## 8. Staleness Detection

The reference graph's `verified: boolean` flag catches **structural** staleness —
a wiki link or lat annotation that points to a file that no longer exists. But
staleness has broader dimensions that the reference graph alone doesn't cover.

Staleness detection extends the reference graph's broken-reference concept into
instruction-level analysis.

### 8.1 Types of Staleness

**Reference staleness** (already covered by reference graph):
- A `[[wiki-link]]` pointing to a deleted file
- A `@lat:uses-mcp github` when the github MCP was removed from `.mcp.json`
- A `@lat:refs auth-patterns.md` when `auth-patterns.md` was deleted

**Rule staleness** (new):
- An `.mdc` rules file with a glob pattern that matches zero files
- A skill directory entry in config that points to a deleted directory
- A `.cursorrules` referencing a framework/library not in `package.json`

**Directive staleness** (new, harder):
- An instruction file describing patterns for a framework version that's been
  upgraded (e.g., "use React class components" when project uses React 18+)
- References to API endpoints, routes, or database tables that no longer exist
  in the codebase
- Environment variable references (`$API_KEY`) where the var is no longer used

### 8.2 Detection Strategy

**Tier 1 — Reference staleness:** Already handled by the reference graph
pipeline (Stage 3 structural scan + verification). No new work needed.

**Tier 2 — Rule staleness:** Straightforward filesystem checks:
- Expand .mdc glob patterns → count matching files. Zero matches = stale.
- Resolve skill directory paths → check existence.
- Straightforward to implement, high confidence.

**Tier 3 — Directive staleness:** Requires cross-referencing instruction content
against the actual codebase. This is expensive and lower confidence:
- Scan instruction files for package/framework name mentions → check `package.json`
- Scan for file path references → check existence
- Scan for env var references → check `.env.example` or actual env

Tier 3 is opt-in (`--deep-staleness`) due to cost and false positive risk.

### 8.3 Relationship to Existing Analysis

| Module | What It Detects | Entities Checked |
|--------|----------------|-----------------|
| `dead-caps.ts` | Broken/empty **MCP tools** | Tool schemas, descriptions |
| Reference graph `verified` | Broken **structural links** | File paths, entity names |
| **Staleness tier 2** (new) | Dead **rules and configs** | Glob patterns, skill dirs |
| **Staleness tier 3** (new) | Drifted **directive content** | Instructions vs. codebase |

`dead-caps.ts` asks "is this MCP tool broken?" Staleness asks "is this
instruction/rule/reference still relevant?" Different scope, different entities.

### 8.4 Output Type

```typescript
type StalenessType =
  | "broken_reference"       // covered by ref graph (included for completeness)
  | "dead_glob"              // .mdc glob matches zero files
  | "missing_skill_dir"      // skill directory doesn't exist
  | "missing_dependency"     // references package not in package.json
  | "missing_env_var"        // references env var not in .env.example
  | "dead_path_reference";   // instruction mentions file path that doesn't exist

interface StaleEntity {
  source: string;            // file containing the stale reference/directive
  line_number?: number;
  staleness_type: StalenessType;
  stale_target: string;      // what's stale (the glob, the path, the package name)
  confidence: number;        // 1.0 for filesystem checks, lower for content analysis
  detail: string;            // human-readable explanation
  tier: 1 | 2 | 3;          // detection tier
}
```

### 8.5 Dashboard Visualization

Stale entities map to visual decay in the solar system:

| Staleness | Visual Treatment |
|-----------|-----------------|
| Broken reference (tier 1) | Red broken arc (already specified) |
| Dead glob / missing dir (tier 2) | Moon/satellite with cracking surface texture |
| Drifted directive (tier 3) | Faint amber glow on the moon — "aging" indicator |

---

## 9. Core Types

### 9.1 Context Surface Types

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

### 9.2 Reference Types

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

### 9.3 Graph Types

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

### 9.4 Rules File Type (New)

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

## 10. CLI Integration

### 10.1 New Artifacts

| Artifact | Content | When Written |
|----------|---------|-------------|
| `surface.json` | ContextSurface for current platform | `plan`, `workspace` |
| `topology.json` | ReferenceGraph + contradictions + staleness | `plan`, `workspace` |

### 10.2 Plan Report Integration

The plan report gains new sections:

```typescript
interface PlanReport {
  // ... existing fields (capabilities, budgets, runtime_targets,
  //     workspace, analysis, recommendations, diagnostics) ...

  // NEW — extends the existing analysis field
  context_surface: ContextSurface;
  reference_graph: {
    connectivity_pct: number;
    linked: number;
    unlinked: number;
    broken_references: number;
    unlinked_entities: string[];
  };
  contradictions: Contradiction[];   // from Section 7
  staleness: StaleEntity[];          // from Section 8
}
```

Note: `contradictions` and `staleness` are **new analysis dimensions** that sit
alongside the existing `analysis.redundancy_clusters`, `analysis.dead_capabilities`,
and `analysis.warnings`. They don't replace or overlap with those — see the
comparison tables in Sections 7.3 and 8.3.

### 10.3 New CLI Flags

```bash
# Fail if connectivity drops below threshold
agentctl plan --fail-on-connectivity 80

# Fail if any agentic files are unlinked/orphaned
agentctl plan --fail-on-unlinked

# Fail if broken structural references exist
agentctl plan --fail-on-broken-refs

# Fail if contradictions of a given severity exist
agentctl plan --fail-on-contradictions          # any hard_conflict
agentctl plan --fail-on-contradictions warning  # hard_conflict or scope_override

# Fail if tier 1-2 staleness detected
agentctl plan --fail-on-stale

# Specify platform for context surface analysis
agentctl plan --platform cursor
agentctl plan --platform claude-code   # default

# Enable deep staleness (tier 3 — cross-references against codebase)
agentctl plan --deep-staleness

# Show reference graph in workspace command
agentctl workspace --refs
agentctl workspace --refs --semantic    # include semantic refs

# Lattice management
agentctl lattice generate              # propose annotations
agentctl lattice generate --apply      # write into files
agentctl lattice validate              # check existing annotations
agentctl lattice diff                  # show changes since last generation
```

### 10.4 Terminal Output

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

The plan report includes contradictions and staleness when detected:

```
⚡ Contradictions (2 found)

  ✖ HARD CONFLICT: testing framework
    CLAUDE.md:24        "Use Jest for all testing"
    .cursor/rules/test.mdc:3  "Use Vitest for all test files"

  ⚠ SCOPE OVERRIDE: language choice
    CLAUDE.md:8         "Use TypeScript strict mode everywhere"
    src/legacy/CLAUDE.md:2  "Use JavaScript for files in this directory"

🕰 Stale References (1 found)

  ⚠ .cursor/rules/api.mdc
    Glob pattern "src/api/v1/**/*.ts" matches 0 files (dead glob)
```

---

## 11. Dashboard Mapping

### 11.1 Context Surface → Planet

The context surface maps to planet visual properties:

| Surface Property | Planet Visual |
|-----------------|---------------|
| total_tokens | Planet size (radius) |
| composition breakdown | Surface terrain bands / geological strata |
| core_tokens vs. conditional_tokens | Solid core vs. shimmering outer shell |
| connectivity_pct | Surface detail richness |
| pressure.surface_pct | Atmosphere density |
| platform | Planet color palette / texture family |

### 11.2 Reference Arcs → Visual Arcs

| Reference Property | Arc Visual |
|-------------------|------------|
| category: structural | Solid line |
| category: semantic | Dashed line |
| reference_type: lat_annotation | Bright solid, labeled with annotation |
| confidence | Line opacity (higher = more opaque) |
| verified: false (broken) | Red, broken/jagged line with warning icon |
| degrees_from_surface | Arc length / curvature |

### 11.3 Connectivity → Object State

| Connectivity | Visual Treatment |
|-------------|-----------------|
| linked, degree 1 | Close orbit, bright, stable |
| linked, degree 2+ | Further orbit, slightly dimmer |
| unlinked | Dim, transparent, wobbling, drifting outward |
| broken reference source | Pulsing warning glow on the source object |

### 11.4 Contradictions → Visual Conflicts

When contradictions exist between two moons (instruction files), the dashboard
shows them as a visible tension:

| Contradiction Type | Visual Treatment |
|-------------------|-----------------|
| hard_conflict | Red crackling arc between the two moons — "lightning" between them |
| scope_override | Amber arc with directional arrow (child overriding parent) |
| tool_overlap | Yellow dotted arc between the moons that reference competing tools |

Clicking a contradiction arc opens the inspect panel showing both directives
side-by-side with the conflict highlighted.

### 11.5 Staleness → Visual Decay

| Staleness | Visual Treatment |
|-----------|-----------------|
| Broken reference (tier 1) | Red broken arc (same as unverified reference) |
| Dead glob / missing dir (tier 2) | Moon with cracking/crumbling surface texture |
| Drifted directive (tier 3) | Faint amber glow — the moon is "aging" |

Stale objects don't drift outward like unlinked objects (they ARE linked, just
to something that no longer exists). Instead they show material degradation —
they're eroding in place.

---

## 12. Open Questions & Future Work

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

### Contradiction Detection

9. **Directive extraction quality** — Extracting imperative statements from
   free-form markdown is non-trivial. Start with high-precision patterns
   (always/never/use/avoid) and expand. False positives are worse than
   false negatives here.

10. **Intentional overrides** — Scope overrides are sometimes intentional.
    Consider a `@lat:overrides <path>` annotation that explicitly marks an
    intentional scope override, suppressing the warning.

11. **Cross-file contradiction at scale** — Pairwise comparison is O(n²) on
    directives. For large projects, may need topic fingerprint indexing to
    avoid comparing every pair.

### Staleness

12. **Tier 3 false positives** — Cross-referencing directives against the
    codebase will produce false positives. Tier 3 must be opt-in and clearly
    labeled as "suggestions" not "errors."

13. **Staleness vs. intentional legacy** — "Use JavaScript in this directory"
    might be stale OR it might be an intentional legacy exception. Context
    matters. This is where the `@lat:deprecated` annotation becomes useful.

### Scale

14. **Large monorepos** — Projects with 100+ instruction files. The reference
    graph could become expensive to compute. Consider caching, incremental
    updates, and a max-depth setting for semantic detection.

15. **Cross-project references** — In a workspace, can project A's instructions
    reference project B's MCP servers? This becomes relevant in Phase 2
    (multi-project workspaces).

### Inspiration & Prior Art

16. **Karpathy's LLM Wiki** — The compounding artifact model, lint-as-health-check
    pattern, and index/log structure directly influenced the lattice and
    contradiction detection designs. Key difference: LLM Wiki is for knowledge
    management; agentctl is for infrastructure management. But the core insight
    — that cross-references are as valuable as documents — is identical.
