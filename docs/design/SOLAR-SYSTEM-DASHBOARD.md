# agentctl Solar System Dashboard — Design Document

> Status: Brainstorm / RFC
> Date: 2026-04-06
> Revision: 2

## Vision

Transform agentctl from a CLI-only analysis tool into a full visual orchestration
platform. The core metaphor: **your agentic development stack is a solar system**.

The CLI remains the open-source heart — the analysis engine, MCP client, token
budgeting, and optimization. The dashboard is a paid product that wraps the CLI's
data in an interactive 3D visualization, adding workspace management, historical
tracking, and team collaboration.

The dashboard is **agentic-first** — it visualizes the agentic layer (instructions,
skills, MCP connections) rather than source code. The codebase itself is implicit;
the planet's gravity. What you see in orbit is everything that shapes how an AI
agent understands and operates within that project.

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

### Planet = Root Instruction File (CLAUDE.md / AGENTS.md)

The planet **is** the root instruction file — the governing document that defines
how the AI agent understands the project. This is the conceptual center of gravity.
Everything else orbits it because everything else exists in relation to it.

| Planet Property | Maps To |
|-----------------|---------|
| Size | Token count of root instruction file + overall context footprint |
| Surface richness | Reference density (well-connected root = detailed surface) |
| Color / texture | Health status (green/blue = healthy, orange/red = warnings) |
| Atmosphere thickness | Context pressure (thick haze = high pressure, clear = comfortable) |
| Rotation speed | Development velocity / config change frequency |

A project with **no root instruction file** is a barren, featureless rock — visually
communicating that there's no agentic governance in place.

### Moons = .md Files (Instructions + Skills)

All markdown files that contribute to the agentic layer orbit the planet as moons.
Instructions and skills are both .md files — they differ in purpose but share a
nature. Distinguished by color:

| Moon Type | Color | Examples |
|-----------|-------|---------|
| Instruction files | Blue | Nested CLAUDE.md, instructions.md, system.md |
| Skills | Gold | SKILL.md files from skill directories |
| Other agentic .md | Silver/White | Referenced docs, prompt templates |

| Moon Property | Maps To |
|---------------|---------|
| Size | Token count |
| Orbit distance | Degrees of separation from root (see Reference Graph) |
| Brightness | Connectivity — well-referenced moons glow brighter |
| Count | Number of agentic document layers |

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

### Debris / Asteroids = Dead Capabilities

Broken tools, empty descriptions, zero-tool servers. Drift through the orbital
space as visual noise. The `optimize` command becomes "clearing the debris field."

### Comets = Diffs / Changes

When config changes are detected, they streak across the system — showing what
entered or left the gravitational field.

---

## The Reference Graph — Connectivity as Core Signal

The most important structural insight in the dashboard is **connectivity**. Every
moon and satellite is either linked to the planet or it isn't.

### How Linking Works

**Linked** = the root instruction file references it directly, OR it is reachable
through a chain of references (any degree of separation). These objects orbit
normally, look healthy, feel integrated.

**Unlinked** = nothing in the reference chain connects it back to the root. These
are **drifting**:

- Dimmer / partially transparent
- Unstable orbit (subtle wobble, slowly drifting outward)
- Broken tether visual — a faded, dashed line where a connection should be
- Small warning indicator

This immediately surfaces real problems:
- Orphaned instruction files no agent will ever see
- MCP servers configured but never mentioned in any prompt
- Skills that exist but aren't referenced anywhere

### Reference Detection (New CLI Module)

The CLI core needs a new analysis module that builds a reference graph:

```typescript
interface AgenticReference {
  source: string;              // file path of the referencing file
  target: string;              // what it references
  target_type: "instruction" | "skill" | "mcp" | "file";
  match_type: "explicit_path"  // e.g., "see src/api/CLAUDE.md"
            | "name_mention"   // e.g., "use the github MCP server"
            | "skill_invoke"   // e.g., "run the deploy skill"
            | "mcp_tool_ref";  // e.g., "use the create_issue tool"
  context: string;             // the line containing the reference
  line_number?: number;
}

interface ConnectivityStatus {
  object_id: string;           // file path or MCP server name
  object_type: "instruction" | "skill" | "mcp";
  linked: boolean;
  degrees_from_root: number | null;  // null if unlinked
  reference_chain: string[];         // path from root to this object
  referenced_by: string[];           // what points to this object
  references: string[];              // what this object points to
}

interface ReferenceGraph {
  root: string;                      // root instruction file path
  nodes: ConnectivityStatus[];
  edges: AgenticReference[];
  summary: {
    total_nodes: number;
    linked_nodes: number;
    unlinked_nodes: number;
    connectivity_pct: number;        // linked / total
    max_depth: number;               // longest reference chain
  };
}
```

### Reference Arcs (Visual)

Arcs appear **on interaction**, not all at once (prevents visual overload):

- **Click planet** → arcs fan out to all directly referenced moons and satellites
- **Click a moon** → bidirectional arcs: what it references AND what references it
- **Click a satellite (MCP)** → arcs to moons/planet that mention this server
- **"Show all connections" toggle** → full reference web visible at once

**Arc styling:**
- Solid bright line = direct reference (1 degree of separation)
- Dashed/faded line = indirect reference (2+ degrees)
- Arc color follows target type (blue = instruction, gold = skill, green = MCP)
- Broken/red arc = reference to something that doesn't exist (dead reference)

**Chain visualization:** Click an unlinked object → the system shows why it's
unlinked (no arcs connect to it). Click a deeply-linked object → the full chain
lights up: planet → moon A → moon B → this moon. The reference topology becomes
visible without needing a separate graph view.

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
    ├── Planet surface: root instruction file identity
    ├── Moons orbiting: instruction files (blue) + skills (gold)
    │   ├── Linked moons: bright, stable orbit
    │   ├── Unlinked moons: dim, drifting, broken tether
    │   └── Click moon: inspect panel
    │
    ├── Satellites: MCP servers
    │   ├── Green blink: connected
    │   ├── Red blink: disconnected
    │   ├── Distance from planet: token cost
    │   └── Click satellite: inspect panel
    │
    ├── Debris: dead capabilities (drifting)
    │   └── Click debris: details + "Clear" button
    │
    ├── Reference arcs: appear on click/hover
    │
    └── Toolbar:
        ├── Run Scan (re-scan MCP servers)
        ├── Run Doctor (health check)
        ├── Optimize (clear debris field)
        ├── Show All Connections (toggle reference arcs)
        ├── Timeline (historical scrubber)
        └── Compare (side-by-side diff view)
```

### Inspect Panel

When any object is clicked, a side panel slides in showing:

**For planet (root instruction):**
- File content (rendered markdown)
- Token count
- Outgoing references (what it mentions)
- Health summary from plan report
- Context pressure gauge

**For moons (instructions / skills):**
- File content (rendered markdown)
- Token count, scope, depth
- Connectivity: linked/unlinked, degrees from root, reference chain
- Outgoing references
- Incoming references (what mentions this file)
- "Open in editor" action

**For satellites (MCP servers):**
- Connection status + latency
- Transport type
- Tools list (name, description, token cost per tool)
- Total token cost
- Which instruction files reference this server
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
│  Analysis: redundancy, dead caps, pressure, REFERENCES (new)│
│  MCP Client: stdio, SSE, HTTP, OAuth                        │
│  Token Budgeting: per-model context estimation              │
│  Output: JSON artifacts (.agentctl/latest/)                 │
│                                                             │
│  NEW: reference graph builder (connectivity analysis)       │
│  NEW: workspace.yaml — multi-project workspace definition   │
│  NEW: agentctl serve — local API server for dashboard       │
│  NEW: topology.json artifact                                │
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
│  │  ├── Planet (root instruction)                       │   │
│  │  ├── Moons (instructions + skills, color-coded)      │   │
│  │  ├── Satellites (MCP servers, status lights)         │   │
│  │  ├── Debris (dead capabilities)                      │   │
│  │  └── Reference Arcs (on interaction)                 │   │
│  │                                                      │   │
│  │  Panels: Inspect, Timeline, Compare, Optimize        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  API Layer (tRPC / Express)                          │   │
│  │  - Workspace CRUD                                    │   │
│  │  - Project scanning (delegates to CLI)               │   │
│  │  - Reference graph serving                           │   │
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
  root_instruction: InstructionFile | null;  // null = barren rock
  size: number;
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
  file: InstructionFile | SkillEntry;
  moon_type: "instruction" | "skill";
  orbit_radius: number;           // from degrees_of_separation or depth
  size: number;                   // from token_count
  linked: boolean;                // from reference graph
  degrees_from_root: number | null;
  brightness: number;             // from reference count (more refs = brighter)
}

interface SatelliteNode {
  mcp_server: McpEntry;
  status: "connected" | "disconnected" | "error" | "unknown";
  distance: number;               // from token_cost (higher = further)
  size: number;                   // from tool_count
  transport_shape: "stdio" | "http" | "sse";
  linked: boolean;                // is this server referenced in any instruction?
  blink_color: "green" | "red" | "yellow";
}

interface DebrisNode {
  dead_cap: DeadCapability;
  drift_angle: number;
}
```

### Workspace Config

```typescript
// workspace.yaml
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
  path: string;           // relative or absolute path to project root
  tags?: string[];         // e.g. ["frontend", "api", "shared"]
}
```

### Reference Graph (New Core Type)

```typescript
interface AgenticReference {
  source: string;
  target: string;
  target_type: "instruction" | "skill" | "mcp" | "file";
  match_type: "explicit_path" | "name_mention" | "skill_invoke" | "mcp_tool_ref";
  context: string;
  line_number?: number;
}

interface ConnectivityStatus {
  object_id: string;
  object_type: "instruction" | "skill" | "mcp";
  linked: boolean;
  degrees_from_root: number | null;
  reference_chain: string[];
  referenced_by: string[];
  references: string[];
}

interface ReferenceGraph {
  root: string;
  nodes: ConnectivityStatus[];
  edges: AgenticReference[];
  summary: {
    total_nodes: number;
    linked_nodes: number;
    unlinked_nodes: number;
    connectivity_pct: number;
    max_depth: number;
  };
}
```

---

## Pricing Tiers (Draft)

### Free (OSS CLI)

- Full CLI: scan, plan, doctor, diff, optimize, workspace
- Reference graph analysis (new — valuable even in CLI)
- Single-project analysis
- JSON artifact output
- CI/CD integration (diff gates, fail-on flags)
- Community support

### Pro ($X/month per user)

- Everything in Free
- Solar system dashboard (local)
- Multi-project workspaces
- Reference arc visualization
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

**Why R3F:**
- Component model matches React (each celestial body = component)
- `@react-three/drei` — orbit controls, text, effects
- `@react-three/postprocessing` — bloom (star glow), depth of field
- Large ecosystem, active community

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
- Stores: workspace configs, historical snapshots, preferences

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
│   │   │   │   └── references.ts    ← NEW: reference graph builder
│   │   │   ├── config/
│   │   │   ├── mcp/
│   │   │   ├── tokens/
│   │   │   ├── workspace/
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   ├── cli/               # CLI commands (thin shell over core)
│   │   ├── src/commands/
│   │   └── package.json
│   │
│   ├── api/               # Local API server for dashboard
│   │   ├── src/
│   │   │   ├── routers/
│   │   │   ├── ws/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── dashboard/         # React + R3F frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── scene/
│   │   │   │   │   ├── Star.tsx
│   │   │   │   │   ├── Planet.tsx
│   │   │   │   │   ├── Moon.tsx
│   │   │   │   │   ├── Satellite.tsx
│   │   │   │   │   ├── Debris.tsx
│   │   │   │   │   ├── ReferenceArc.tsx
│   │   │   │   │   └── SolarSystem.tsx
│   │   │   │   ├── panels/
│   │   │   │   │   ├── InspectPanel.tsx
│   │   │   │   │   ├── TimelineBar.tsx
│   │   │   │   │   └── CompareView.tsx
│   │   │   │   └── layout/
│   │   │   ├── hooks/
│   │   │   ├── stores/
│   │   │   └── App.tsx
│   │   └── package.json
│   │
│   └── shared/            # Shared types
│       └── src/types.ts
│
├── pnpm-workspace.yaml
└── package.json
```

---

## Phase Roadmap

### Phase 1 — Reference Graph + Local Dashboard MVP

**Goal:** `agentctl dashboard` opens browser with 3D planet view of current project.

- [ ] Build reference graph analysis module in core
- [ ] Add `topology.json` artifact output to plan pipeline
- [ ] Add connectivity data to workspace command
- [ ] Extract core library from CLI (`packages/core`)
- [ ] `agentctl serve` command — local tRPC server
- [ ] React + Vite + R3F frontend scaffolding
- [ ] Single planet view: moons (blue/gold), satellites (blinking), debris
- [ ] Reference arcs on click
- [ ] Unlinked objects visual treatment (dim, drifting)
- [ ] Inspect panel (click any object → see data)
- [ ] Run CLI commands from UI (scan, doctor, optimize)

### Phase 2 — Multi-Project Workspace

**Goal:** Full solar system with multiple planets.

- [ ] `workspace.yaml` config format
- [ ] Batch scanning across projects
- [ ] Star node with aggregate metrics
- [ ] Solar system view with orbit animations
- [ ] Fly-in/fly-out camera transitions between workspace and planet views
- [ ] Cross-project redundancy detection

### Phase 3 — Live Monitoring + History

**Goal:** Dashboard stays alive, reacts to changes, shows evolution.

- [ ] File watchers on MCP configs + instruction files
- [ ] Auto re-scan on change → WebSocket push
- [ ] MCP server health polling (satellite status lights update live)
- [ ] SQLite for historical snapshots
- [ ] Timeline scrubber (git history integration)
- [ ] Comet animations for detected changes
- [ ] Trend charts (token budget, connectivity % over time)

### Phase 4 — SaaS + Teams

**Goal:** Cloud-hosted multi-user workspaces.

- [ ] Auth (clerk / auth.js)
- [ ] Cloud persistence (Turso)
- [ ] Team workspaces with role-based access
- [ ] Webhook integrations (Slack, Discord)
- [ ] Shared workspace URLs
- [ ] Billing integration (Stripe)

---

## Open Questions

1. **2D fallback?** A flat graph view for accessibility and low-power devices.
   The reference graph data lends itself naturally to a force-directed 2D layout.

2. **Large workspaces?** 50+ projects. LOD system, tag-based filtering, or
   clustering distant planets into "constellation" groups.

3. **Electron vs. browser?** Browser-first (`agentctl dashboard` starts local
   server + opens browser) is lower friction. Electron later for power users
   who want system tray, auto-updates, native file watching.

4. **Procedural planet textures?** Hash project config into a seed for
   deterministic but unique planet appearances. Each project is visually distinct.

5. **Background aesthetics?** Star field, nebulae, constellations. Could map
   constellations to project tag groupings.

6. **Sound design?** Ambient space audio, click feedback, warning tones for
   red-blinking satellites. Optional but high delight. Low priority.

7. **How aggressive should reference detection be?** Fuzzy matching (e.g., "use
   the github server" → matches MCP server named "github") vs. strict matching
   (explicit paths only). Probably: strict first, fuzzy as opt-in.

8. **Should connectivity % be a CI gate?** `agentctl plan --fail-on-unlinked`
   fails if any agentic files are orphaned. Powerful for teams.
