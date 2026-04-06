# agentctl Solar System Dashboard — Design Document

> Status: Brainstorm / RFC
> Date: 2026-04-06
> Revision: 3

## Vision

Transform agentctl from a CLI-only analysis tool into a full visual orchestration
platform. The core metaphor: **your agentic development stack is a solar system**.

The CLI remains the open-source heart — the analysis engine, MCP client, token
budgeting, and optimization. The dashboard is a paid product that wraps the CLI's
data in an interactive 3D visualization, adding workspace management, historical
tracking, and team collaboration.

The dashboard is **agentic-first** — it visualizes the agentic layer (instructions,
skills, MCP connections, rules) rather than source code. The codebase itself is
implicit; the planet's gravity. What you see in orbit is everything that shapes
how an AI agent understands and operates within that project.

**Companion document:** See [CONTEXT-SURFACE-AND-REFERENCES.md](./CONTEXT-SURFACE-AND-REFERENCES.md)
for the full specification of the context surface model, reference graph system,
structural vs. semantic reference detection, and lat annotation format.

---

## The Solar System Metaphor

### Star = Workspace

The gravitational center of everything. A workspace is a collection of related
projects (a team, a product suite, an organization's agent configs).

| Star Property | Maps To |
|---------------|---------|
| Size / luminosity | Aggregate health score across projects |
| Color | Overall status (blue-white = healthy, yellow = warnings, red = critical) |
| Pulse rate | Development activity / config change frequency |

### Planet = Context Surface

The planet represents the **context surface** — the totality of everything that is
directly visible to an AI agent at the start of a session. This is not a single
file but a composite of all auto-injected context that forms the agent's initial
understanding of the project.

The context surface includes:
- **Root instruction files** — CLAUDE.md, AGENTS.md (auto-loaded)
- **Parent directory instructions** — CLAUDE.md files up the tree to git root
- **Rules files** — .mdc (glob-matched), .cursorrules, .windsurfrules
- **MCP tool definitions** — tool schemas injected from configured servers
- **Auto-loaded skills** — skills discovered in skill directories
- **Custom instructions** — .claude/settings.json `customInstructions`
- **Hook output** — SessionStart hooks, prompt-submit hooks
- **IDE system prompts** — built-in system context from the IDE/tool
- **Project config** — agentctl.yaml, .cursor/config, etc.

| Planet Property | Maps To |
|-----------------|---------|
| Size | Total context surface token weight |
| Surface richness / detail | Reference density + connectivity % |
| Color / texture | Health status (green/blue = healthy, orange/red = warnings) |
| Atmosphere thickness | Context pressure (thick haze = high pressure, clear = comfortable) |
| Atmosphere layers | Conditionally-activated context (shimmers based on what's active) |
| Rotation speed | Development velocity / config change frequency |
| Terrain features | Platform-specific context layers (visible geological strata) |

A project with **an empty context surface** is a barren, featureless rock — visually
communicating that there's no agentic governance in place.

**Platform awareness:** The same project may render differently depending on the
agent platform being analyzed (Claude Code vs. Cursor vs. Windsurf), because the
context surface differs per platform. The dashboard should support switching
between platform views.

### Moons = .md Files (Instructions + Skills)

All markdown files that contribute to the agentic layer orbit the planet as moons.
Instructions and skills are both .md files — they differ in purpose but share a
nature. Distinguished by color:

| Moon Type | Color | Examples |
|-----------|-------|---------|
| Instruction files | Blue | Nested CLAUDE.md, instructions.md, system.md |
| Skills | Gold | SKILL.md files from skill directories |
| Rules files | Violet | .mdc files, .cursorrules, .windsurfrules |
| Other agentic .md | Silver/White | Referenced docs, prompt templates |

| Moon Property | Maps To |
|---------------|---------|
| Size | Token count |
| Orbit distance | Degrees of separation from context surface (see Reference Graph) |
| Brightness | Connectivity — well-referenced moons glow brighter |
| Stability | Linked = stable orbit; unlinked = drifting, wobbling |

### Satellites = MCP Servers

MCP servers are external connections — artificial objects placed in orbit to extend
the planet's capabilities. They connect the project to third-party services and
tools.

| Satellite Property | Maps To |
|--------------------|---------|
| Status light | Blinking green = connected, blinking red = disconnected/error |
| Distance from planet | Token cost / efficiency (expensive = further out) |
| Size | Tool count |
| Shape/model | Transport type (distinct silhouettes for stdio, http, sse) |
| Antenna dish direction | Points "outward" toward the service it connects to |
| Linked/unlinked | Referenced in any instruction = stable; unreferenced = drifting |

### Debris / Asteroids = Dead Capabilities

Broken tools, empty descriptions, zero-tool servers. Drift through the orbital
space as visual noise. The `optimize` command becomes "clearing the debris field."

### Comets = Diffs / Changes

When config changes are detected, they streak across the system — showing what
entered or left the gravitational field.

---

## Connectivity & Reference Arcs

The reference graph is the structural backbone of the visualization. Every moon
and satellite is either **linked** or **unlinked** to the context surface.

See [CONTEXT-SURFACE-AND-REFERENCES.md](./CONTEXT-SURFACE-AND-REFERENCES.md)
for the full reference detection system, including:
- Three-layer reference detection (lat annotations, wiki/structural links, semantic)
- Confidence scoring per reference type
- The `ReferenceGraph` and `ConnectivityStatus` type definitions
- Lat annotation format specification
- **Contradiction detection** — conflicting directives across instruction files
  (distinct from redundancy, which detects sameness between MCP tools)
- **Staleness detection** — dead globs, missing references, drifted directives
  (extends dead-caps detection, which focuses on MCP tool schemas)

### Visual Treatment

**Linked objects** (reachable from context surface through reference chain):
- Bright, stable orbit
- Solid reference arcs on click

**Unlinked objects** (orphaned — no reference chain to context surface):
- Dimmer / partially transparent
- Unstable orbit (subtle wobble, slowly drifting outward)
- Broken tether visual
- Warning indicator

### Arc Interaction

Arcs appear **on interaction**, not all at once:

- **Click planet** → arcs fan out to all directly referenced objects
- **Click a moon** → bidirectional arcs: what it references AND what references it
- **Click a satellite** → arcs to instructions that mention this server
- **"Show all connections" toggle** → full reference web

**Arc styling by reference type:**

| Reference Type | Arc Style |
|----------------|-----------|
| Lat annotation | Solid bright line, labeled |
| Wiki link / explicit path | Solid line |
| Glob pattern match | Solid line, dashed at edges (pattern-based) |
| Semantic match (high confidence) | Dashed line, confidence % tooltip |
| Semantic match (low confidence) | Faint dotted line, "show all" mode only |
| Broken reference (target missing) | Red broken line with warning icon |
| Contradiction (hard conflict) | Red crackling "lightning" arc between conflicting moons |
| Contradiction (scope override) | Amber directional arc (child overriding parent) |
| Stale reference | Arc with crumbling/dissolving particles — decaying in place |

**Chain visualization:** Click a deeply-linked object → the full chain lights up:
planet surface → moon A → moon B → this moon. Click an unlinked object → the
system shows why it's unlinked (no arcs connect to it). Click a contradiction arc
→ inspect panel shows both directives side-by-side with the conflict highlighted.

---

## Interaction Design

### Navigation Flow

```
Workspace (Solar System) — zoomed out
│
├── Star in center, planets orbiting
├── Star info panel: workspace name, aggregate metrics
├── Hover planet: tooltip with project name, health badge, moon/satellite count
├── Click planet: camera fly-in transition
│
└── Planet Detail — zoomed in
    │
    ├── Planet surface: context surface identity + composition breakdown
    ├── Moons orbiting: instructions (blue), skills (gold), rules (violet)
    │   ├── Linked moons: bright, stable orbit
    │   ├── Unlinked moons: dim, drifting, broken tether
    │   └── Click moon: inspect panel
    │
    ├── Satellites: MCP servers
    │   ├── Green blink: connected
    │   ├── Red blink: disconnected
    │   ├── Distance from planet: token cost
    │   ├── Linked/unlinked visual treatment
    │   └── Click satellite: inspect panel
    │
    ├── Debris: dead capabilities (drifting)
    │   └── Click debris: details + "Clear" button
    │
    ├── Reference arcs: appear on click/hover (styled by type)
    │
    └── Toolbar:
        ├── Run Scan (re-scan MCP servers)
        ├── Run Doctor (health check)
        ├── Optimize (clear debris field)
        ├── Show All Connections (toggle reference arcs)
        ├── Platform Selector (Claude Code / Cursor / Windsurf)
        ├── Timeline (historical scrubber)
        └── Compare (side-by-side diff view)
```

### Inspect Panel

When any object is clicked, a side panel slides in showing:

**For planet (context surface):**
- Composition breakdown: which files/configs contribute to the surface
- Per-layer token counts (instructions, rules, MCP tools, skills, hooks)
- Total context surface tokens vs. model context window (pressure gauge)
- Outgoing references from surface files
- Connectivity summary (X linked, Y unlinked, Z% connectivity)
- Platform indicator

**For moons (instructions / skills / rules):**
- File content (rendered markdown)
- Token count, scope, depth
- Connectivity: linked/unlinked, degrees from surface, reference chain
- Reference breakdown: structural refs, semantic refs (with confidence)
- Outgoing references
- Incoming references (what mentions this file)
- For .mdc rules: glob pattern + which files it matches
- "Open in editor" action

**For satellites (MCP servers):**
- Connection status + latency
- Transport type
- Tools list (name, description, token cost per tool)
- Total token cost
- Which instruction files reference this server (structural + semantic)
- Dead capabilities within this server
- "Run doctor check" action

**For debris (dead capabilities):**
- Server name, tool name
- Why it's dead (empty description, broken schema, etc.)
- Token waste
- "Remove" action (runs optimize for this specific item)

### Timeline / History View

- Bottom scrubber bar shows git history timeline
- Dragging scrubber morphs the solar system in real-time
- Planets grow/shrink, moons appear/disappear, satellites change status
- Uses `agentctl diff` data between commits
- Comets animate across screen at change points

### Comparison Mode

- Split screen: two solar systems side by side
- Same project at different points in time, or two branches
- Delta highlights: pulsing borders on changed elements
- Summary stats overlay showing numeric diffs

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    agentctl (OSS Core)                       │
│                                                             │
│  CLI: scan, plan, doctor, diff, optimize, workspace         │
│  Analysis: redundancy, dead caps, pressure (existing)       │
│  Analysis: reference graph (structural + semantic) [NEW]    │
│  Analysis: contradiction detection (instruction conflicts)  │
│  Analysis: staleness detection (dead globs, drift) [NEW]    │
│  Analysis: context surface builder [NEW]                    │
│  MCP Client: stdio, SSE, HTTP, OAuth                        │
│  Token Budgeting: per-model context estimation              │
│  Output: JSON artifacts (.agentctl/latest/)                 │
│                                                             │
│  NEW: context surface model (platform-aware)                │
│  NEW: reference graph builder (3-layer detection)           │
│  NEW: lat annotation parser                                 │
│  NEW: workspace.yaml — multi-project workspace definition   │
│  NEW: agentctl serve — local API server for dashboard       │
│  NEW: topology.json + surface.json artifacts                │
└──────────────────────┬──────────────────────────────────────┘
                       │ JSON over HTTP / WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│                agentctl-dashboard (Paid)                     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Frontend (React + React Three Fiber)                │   │
│  │                                                      │   │
│  │  Solar System Scene                                  │   │
│  │  ├── Star (workspace)                                │   │
│  │  ├── Planet (context surface — composite)            │   │
│  │  ├── Moons (instructions, skills, rules — colored)   │   │
│  │  ├── Satellites (MCP servers, status lights)         │   │
│  │  ├── Debris (dead capabilities)                      │   │
│  │  └── Reference Arcs (structural + semantic, styled)  │   │
│  │                                                      │   │
│  │  Panels: Inspect, Timeline, Compare, Optimize        │   │
│  │  Platform Selector: Claude Code / Cursor / Windsurf  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  API Layer (tRPC / Express)                          │   │
│  │  - Workspace CRUD                                    │   │
│  │  - Project scanning (delegates to CLI)               │   │
│  │  - Reference graph + surface serving                 │   │
│  │  - WebSocket for live updates                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Persistence (SQLite / Turso)                        │   │
│  │  - Workspace definitions                             │   │
│  │  - Historical snapshots                              │   │
│  │  - User preferences                                  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Scene Graph Types

```typescript
interface SolarSystem {
  star: StarNode;
  planets: PlanetNode[];
  timestamp: string;
}

interface StarNode {
  workspace: string;
  health_score: number;           // 0-100
  total_projects: number;
  total_tools: number;
  total_tokens: number;
  status: "healthy" | "warning" | "critical";
}

interface PlanetNode {
  project: string;
  path: string;
  context_surface: ContextSurface;
  size: number;                   // total surface token weight
  health: "healthy" | "warning" | "error";
  context_pressure: number;       // 0-1, atmosphere thickness
  waste_percentage: number;
  moons: MoonNode[];
  satellites: SatelliteNode[];
  debris: DebrisNode[];
  reference_graph: ReferenceGraph;
  plan_report: PlanReport;
}

interface MoonNode {
  file: InstructionFile | SkillEntry | RulesFile;
  moon_type: "instruction" | "skill" | "rules";
  orbit_radius: number;           // from degrees_of_separation
  size: number;                   // from token_count
  linked: boolean;
  degrees_from_surface: number | null;
  brightness: number;             // from reference count
}

interface SatelliteNode {
  mcp_server: McpEntry;
  status: "connected" | "disconnected" | "error" | "unknown";
  distance: number;               // from token_cost
  size: number;                   // from tool_count
  transport_shape: "stdio" | "http" | "sse";
  linked: boolean;
  blink_color: "green" | "red" | "yellow";
}

interface DebrisNode {
  dead_cap: DeadCapability;
  drift_angle: number;
}
```

### Workspace Config

```typescript
interface WorkspaceConfig {
  version: 1;
  workspace: {
    name: string;
    description?: string;
  };
  projects: ProjectRef[];
}

interface ProjectRef {
  name: string;
  path: string;
  tags?: string[];
}
```

See [CONTEXT-SURFACE-AND-REFERENCES.md](./CONTEXT-SURFACE-AND-REFERENCES.md)
for the full `ContextSurface`, `ReferenceGraph`, and `AgenticReference` type
definitions.

---

## Pricing Tiers (Draft)

### Free (OSS CLI)

- Full CLI: scan, plan, doctor, diff, optimize, workspace
- Context surface analysis (new)
- Reference graph with structural detection (new)
- Connectivity % reporting (new)
- Single-project analysis
- JSON artifact output
- CI/CD integration (diff gates, fail-on flags, fail-on-unlinked)
- Community support

### Pro ($X/month per user)

- Everything in Free
- Solar system dashboard (local)
- Multi-project workspaces
- Reference arc visualization (structural + semantic)
- Semantic reference detection
- Platform switching (Claude Code / Cursor / Windsurf views)
- Historical trend tracking (local SQLite)
- One-click optimization
- Priority support

### Team ($Y/month per seat)

- Everything in Pro
- Cloud-hosted workspaces
- Team dashboards & sharing
- Role-based access
- Webhook integrations (Slack, Discord, email)
- Cross-team redundancy detection
- Audit log

---

## Technical Decisions

### Rendering: React Three Fiber (R3F)

**Key packages:**
- `three` + `@react-three/fiber` — core 3D
- `@react-three/drei` — OrbitControls, Text, Stars background, Line (for arcs)
- `@react-three/postprocessing` — bloom, god rays
- `@react-spring/three` — smooth transitions, camera fly-in/out
- `leva` — debug controls during development

### API Layer: tRPC

- End-to-end type safety (shared types with CLI core)
- React Query on frontend
- WebSocket subscriptions for live updates

### Persistence: SQLite (via better-sqlite3 or Drizzle)

- Zero setup for local dashboard
- Upgrades to Turso for SaaS tier

### Monorepo Structure

```
agentctl/
├── packages/
│   ├── core/              # Analysis engine (extracted from current src/)
│   │   ├── src/
│   │   │   ├── analysis/
│   │   │   │   ├── redundancy.ts
│   │   │   │   ├── dead-caps.ts
│   │   │   │   ├── pressure.ts
│   │   │   │   ├── references.ts    ← structural + semantic detection
│   │   │   │   └── surface.ts       ← context surface builder
│   │   │   ├── config/
│   │   │   ├── mcp/
│   │   │   ├── tokens/
│   │   │   ├── workspace/
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   ├── cli/               # CLI commands (thin shell over core)
│   ├── api/               # Local API server for dashboard
│   ├── dashboard/         # React + R3F frontend
│   └── shared/            # Shared types
│
├── pnpm-workspace.yaml
└── package.json
```

---

## Phase Roadmap

### Phase 1 — Context Surface + Reference Graph + Local Dashboard MVP

**Goal:** `agentctl dashboard` opens browser with 3D planet view of current project.

- [ ] Define and build context surface model (platform-aware)
- [ ] Build 3-layer reference graph (lat, structural, semantic)
- [ ] Add `topology.json` + `surface.json` artifact output
- [ ] Add connectivity data to workspace command
- [ ] Extract core library from CLI (`packages/core`)
- [ ] `agentctl serve` — local tRPC server
- [ ] React + Vite + R3F frontend scaffolding
- [ ] Planet as context surface (composite visualization)
- [ ] Moons: instructions (blue), skills (gold), rules (violet)
- [ ] Satellites: MCP servers (blinking status, distance = cost)
- [ ] Reference arcs on click (styled by type + confidence)
- [ ] Unlinked objects visual treatment (dim, drifting)
- [ ] Inspect panel with reference breakdown
- [ ] Run CLI commands from UI

### Phase 2 — Multi-Project Workspace

- [ ] `workspace.yaml` config format
- [ ] Batch scanning across projects
- [ ] Star node with aggregate metrics
- [ ] Solar system view with orbit animations
- [ ] Fly-in/fly-out camera transitions
- [ ] Cross-project redundancy detection
- [ ] Platform selector (Claude Code / Cursor / Windsurf)

### Phase 3 — Live Monitoring + History

- [ ] File watchers on agentic files
- [ ] Auto re-scan on change → WebSocket push
- [ ] MCP server health polling (live satellite status)
- [ ] SQLite for historical snapshots
- [ ] Timeline scrubber (git history)
- [ ] Comet animations for detected changes
- [ ] Trend charts (tokens, connectivity %, waste % over time)

### Phase 4 — SaaS + Teams

- [ ] Auth, cloud persistence, RBAC
- [ ] Team workspaces, shared URLs
- [ ] Webhook integrations
- [ ] Billing (Stripe)

---

## Open Questions

1. **2D fallback?** Force-directed graph layout as accessible alternative.

2. **Large workspaces?** LOD system, tag-based filtering, constellation clusters.

3. **Electron vs. browser?** Browser-first, Electron later for power users.

4. **Procedural planet textures?** Hash context surface composition into a seed
   for deterministic but unique planet appearances per project.

5. **Sound design?** Ambient audio, warning tones. Low priority, high delight.

6. **Platform-specific views?** Same project, different planets depending on
   agent platform. Or one planet with toggleable layers?

7. **Connectivity % as CI gate?** `agentctl plan --fail-on-unlinked` for teams.

8. **Lat annotation adoption?** Should agentctl generate a starter lattice from
   discovered references? User validates → becomes source of truth.
