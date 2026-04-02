# Agentic Development Suite — Feature Roadmap

## Vision

Transform agentctl from a configuration diagnostic tool into the **complete lifecycle manager for AI agent capability stacks** — from initial composition, through active development, to CI-gated optimization.

---

## Current Capabilities (Shipped)

| Command | Purpose |
|---|---|
| `agentctl init` | Scaffold agentctl.yaml project config |
| `agentctl scan` | Discover and probe MCP servers for tools |
| `agentctl plan` | Full analysis pipeline: discover → scan → budget → analyze → report |
| `agentctl doctor` | Validate config, connectivity, env vars, OAuth |
| `agentctl diff` | Compare capability snapshots across git refs |
| `agentctl optimize` | Auto-remove dead/redundant MCP servers |
| `agentctl workspace` | Map agentic infrastructure: instruction files, skills, MCP servers, file tree |

---

## Phase 1: Instruction Intelligence (P0)

### 1.1 Instruction Graph Analysis (`agentctl lint`)

Analyze the content and structure of instruction files across the project tree.

**Problem:** Instruction files (CLAUDE.md, AGENTS.md, nested .md files) cascade through the project but nobody analyzes their quality, consistency, or efficiency. Wasted tokens, contradictory guidance, and stale references go undetected.

**Capabilities:**

- **Contradiction detection** — flag conflicting directives across instruction layers (e.g., root says "use class components", nested says "use functional components only")
- **Instruction redundancy** — identify duplicated guidance across files using TF-IDF similarity (reuse existing `redundancy.ts` approach)
- **Staleness detection** — find instructions referencing files, functions, or patterns that no longer exist in the codebase
- **Coverage analysis** — identify source directories with no instruction context (no CLAUDE.md or nested instructions governing that area)
- **Token efficiency scoring** — rate each instruction file on information density vs token cost

**Output:**

```
── Instruction Lint ──────────────────────────────────
  Files analyzed:    7 (4,200 tokens total)
  Contradictions:    1 (root ↔ src/api/CLAUDE.md)
  Redundant blocks:  2 (est. 380 tokens recoverable)
  Stale references:  3 (referencing deleted files)
  Coverage gaps:     2 dirs with no instruction context

  ! CLAUDE.md:12 says "always use Zod" ↔ src/legacy/CLAUDE.md:5 says "use Joi for validation"
  → src/api/CLAUDE.md references `src/api/middleware/auth.ts` which no longer exists
  → src/utils/ and src/hooks/ have no instruction coverage
```

**Implementation:**

| File | Purpose |
|---|---|
| `src/analysis/instructions.ts` | Core lint engine: contradiction, redundancy, staleness, coverage |
| `src/analysis/instruction-similarity.ts` | TF-IDF for instruction block comparison (extract from redundancy.ts) |
| `src/cli/lint.ts` | CLI command registration |
| `src/output/lint-terminal.ts` | Terminal renderer |

**Key design decisions:**

- Contradiction detection uses semantic keyword opposition (allow/forbid, always/never, use/avoid) scoped by topic extraction
- Staleness detection resolves file path references against the actual file tree
- Coverage analysis walks source dirs and checks for governing instruction files at any ancestor level
- Redundancy reuses the TF-IDF cosine similarity approach from tool redundancy, applied to instruction paragraphs

---

## Phase 2: Context Profiles (P0)

### 2.1 Profile Management

Define named subsets of the full capability stack, each budget-aware.

**Problem:** Every agent run loads the entire MCP + skill + instruction set. For large workspaces this means most of the context window is consumed by irrelevant tools. Developers need task-scoped environments.

**Capabilities:**

- **Create profiles** — named subsets specifying which MCP servers, skills, and instruction scopes to include
- **Budget validation** — each profile is checked against target models to confirm it fits
- **Activate/switch** — write a filtered config that downstream tools consume
- **Diff profiles** — compare two profiles' capability sets and token costs

**CLI surface:**

```bash
agentctl profile create frontend \
  --include-mcp github,filesystem \
  --include-skills ui-review,component-gen \
  --model claude-sonnet-4-6

agentctl profile list
agentctl profile show frontend
agentctl profile activate frontend
agentctl profile diff frontend backend
```

**Storage:** Profiles live in `agentctl.yaml` under a `profiles:` key:

```yaml
profiles:
  frontend:
    mcp_servers: [github, filesystem]
    skills: [ui-review, component-gen]
    instruction_scopes: [src/components/, src/styles/]
  backend:
    mcp_servers: [github, postgres, filesystem]
    skills: [api-design, db-migration]
    instruction_scopes: [src/api/, src/db/]
```

**Implementation:**

| File | Purpose |
|---|---|
| `src/profiles/manage.ts` | Create, list, show, delete, diff profiles |
| `src/profiles/activate.ts` | Write filtered MCP config for active profile |
| `src/profiles/validate.ts` | Budget-check a profile against target models |
| `src/cli/profile.ts` | CLI command registration (subcommands) |
| `src/config/schemas.ts` | Extend project config schema with profiles |

---

## Phase 3: Dependency Intelligence (P1)

### 3.1 Skill → Tool Dependency Mapping

Parse skill content for tool references and build a dependency graph.

**Problem:** Skills implicitly depend on MCP tools (a skill that says "use create_issue to track bugs" requires the GitHub MCP). These dependencies are invisible — removing an MCP server can silently break skills.

**Capabilities:**

- **Dependency extraction** — parse skill SKILL.md content for tool name references
- **Dependency graph** — skill → tools → MCP servers
- **Orphaned skill detection** — skills referencing tools from unconfigured MCP servers
- **Minimum viable MCP set** — per skill, the smallest set of MCP servers needed
- **Impact analysis** — "if I remove server X, which skills break?"

**Output:**

```
── Skill Dependencies ────────────────────────────────
  ui-review
    → read_file (filesystem)
    → search_code (github)
    → create_issue (github)
    Required MCPs: filesystem, github

  db-migration
    → execute_query (postgres)     ← NOT CONFIGURED
    → read_file (filesystem)
    Required MCPs: postgres(!), filesystem

  ! db-migration depends on 'postgres' MCP which is not configured
  ! Removing 'github' would break: ui-review, code-review (2 skills)
```

**Implementation:**

| File | Purpose |
|---|---|
| `src/analysis/skill-deps.ts` | Extract tool references from skill content, build dependency graph |
| `src/analysis/impact.ts` | Compute impact of removing an MCP server on skills |

### 3.2 Instruction → Codebase Reference Mapping

Cross-reference instruction file directives against the actual source tree.

- Extract file/directory paths from instruction content
- Extract function/class/pattern references
- Validate references exist in the current codebase
- Part of the lint pipeline (staleness detection)

---

## Phase 4: Active Development Support (P1)

### 4.1 Watch Mode (`agentctl watch`)

Persistent process that monitors the workspace and re-analyzes on changes.

**Problem:** Developers modify configs, add skills, update instructions, but don't re-run analysis until something breaks. Watch mode makes agentctl a continuous development companion.

**Capabilities:**

- Watch `.mcp.json`, `agentctl.yaml`, instruction files, skill dirs for changes
- Incremental re-analysis on file change (debounced)
- Terminal dashboard with live metrics
- Alert on regressions (new redundancy, budget exceeded, broken dependency)

**Implementation:**

| File | Purpose |
|---|---|
| `src/watch/watcher.ts` | File watcher using `fs.watch` / chokidar |
| `src/watch/incremental.ts` | Incremental analysis (only re-process changed inputs) |
| `src/cli/watch.ts` | CLI command with persistent terminal output |

---

## Phase 5: Simulation & Composition (P2)

### 5.1 Task Simulation (`agentctl simulate`)

Predict which tools/skills would activate for a given task description.

```bash
agentctl simulate "fix the login timeout bug in the auth module"
```

- Uses tool descriptions and skill content to estimate activation
- Shows predicted token usage and whether it fits the model
- Recommends a profile if full stack doesn't fit

### 5.2 Compose (`agentctl compose`)

Scaffold an optimal configuration for a given task type.

```bash
agentctl compose --task "full-stack web dev" --model claude-sonnet-4-6
```

- Recommend initial MCP + skill setup from known server registry
- Budget-fit to target model
- Generate agentctl.yaml + .mcp.json

---

## Implementation Order

```
Phase 1 ─── Instruction Lint ──────────────── builds on workspace discovery
   │
Phase 2 ─── Context Profiles ─────────────── builds on plan + budget pipeline
   │
Phase 3 ─── Skill→Tool Dependencies ──────── builds on skill parse + scan
   │        Instruction→Code References ──── builds on instruction lint
   │
Phase 4 ─── Watch Mode ───────────────────── builds on all analysis modules
   │
Phase 5 ─── Simulate / Compose ───────────── builds on profiles + dependencies
```

Each phase is independently shippable and adds value on its own. Later phases build on earlier ones but don't block them.

---

## Design Principles

1. **Pure analysis functions, side effects only in CLI handlers** — maintain testability
2. **Reuse existing primitives** — TF-IDF from redundancy.ts, token counting from tokenizer.ts, recursive discovery from discover.ts
3. **JSON output for everything** — every command supports `--json` for toolchain integration
4. **Artifacts to `.agentctl/latest/`** — every analysis writes structured output for diffing and CI
5. **Non-destructive by default** — profiles don't modify source configs, they write filtered copies
6. **Incremental where possible** — watch mode and cached scans avoid redundant work
