# agentctl Solar System Dashboard — Design Document

> Status: Brainstorm / RFC
> Date: 2026-04-06

## Vision

Transform agentctl from a CLI-only analysis tool into a full visual orchestration
platform. The core metaphor: **your agentic development stack is a solar system**.

The CLI remains the open-source heart — the analysis engine, MCP client, token
budgeting, and optimization. The dashboard is a paid product that wraps the CLI's
data in an interactive 3D visualization, adding workspace management, historical
tracking, and team collaboration.

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

### Planet = Project

Each project orbits the star. A project is a directory with agentic configuration
(`.mcp.json`, `CLAUDE.md`, skills, etc).

| Planet Property | Maps To |
|-----------------|---------|
| Size | Total context footprint (token budget) |
| Color / texture | Health status (green/blue = healthy, orange/red = warnings/errors) |
| Orbital distance | Coupling to workspace core / activity recency |
| Rotation speed | Development velocity |
| Atmosphere | Context pressure (thick haze = high pressure, clear = comfortable) |

### Moons = Instruction Files (.md documents)

Instruction files orbit the planet because they literally "wrap" the project
with context for the AI agent. They are the natural satellites.

| Moon Property | Maps To |
|---------------|---------|
| Size | Token count of the file |
| Orbit distance | Depth in file tree (root CLAUDE.md = close orbit, nested = far) |
| Surface detail | Scope classification (root / nested / claude-dir) |
| Count | Number of instruction layers |

### Rings = MCP Servers

Like Saturn's rings, MCP servers form a capability band around the project.
Each ring segment represents one server.

| Ring Property | Maps To |
|---------------|---------|
| Segment width / thickness | Tool count |
| Segment brightness / opacity | Token cost (brighter = more expensive) |
| Segment color | Transport type (stdio = blue, http = green, sse = purple) |
| Gaps in ring | Dead capabilities / failed servers |
| Overlapping segments | Redundancy clusters (visual overlap!) |

### Satellites = Skills

Artificial constructs placed in orbit. Human-authored additions to the ecosystem.

| Satellite Property | Maps To |
|--------------------|---------|
| Size | Token count |
| Blinking indicator | has_instruction flag (linked to a moon) |
| Orbit type | Availability (always-on vs. conditional) |
| Antenna / dish model | Skill complexity |

### Debris / Asteroids = Dead Capabilities

Broken tools, empty descriptions, zero-tool servers. Visual noise in the system.
The `optimize` command becomes "clearing the debris field."

### Comets = Diffs / Changes

When config changes are detected, they streak across the system like comets —
showing what entered or left the gravitational field.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    agentctl (OSS Core)                       │
│                                                             │
│  CLI Commands: scan, plan, doctor, diff, optimize, workspace│
│  Analysis Engine: redundancy, dead caps, pressure           │
│  MCP Client: stdio, SSE, HTTP, OAuth                        │
│  Token Budgeting: per-model context estimation              │
│  Output: JSON artifacts (.agentctl/latest/)                 │
│                                                             │
│  NEW: workspace.yaml — multi-project workspace definition   │
│  NEW: agentctl serve — local API server for dashboard       │
└──────────────────────┬──────────────────────────────────────┘
                       │ JSON over HTTP / WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│                agentctl-dashboard (Paid)                     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Frontend (React + React Three Fiber)                │   │
│  │                                                      │   │
│  │  ┌────────────┐ ┌────────────┐ ┌─────────────────┐  │   │
│  │  │ Solar View │ │ Planet     │ │ Timeline /      │  │   │
│  │  │ (zoomed    │ │ Detail     │ │ History         │  │   │
│  │  │  out)      │ │ (zoomed in)│ │ (scrubber)      │  │   │
│  │  └────────────┘ └────────────┘ └─────────────────┘  │   │
│  │                                                      │   │
│  │  ┌────────────┐ ┌────────────┐ ┌─────────────────┐  │   │
│  │  │ Inspect    │ │ Optimize   │ │ Compare /       │  │   │
│  │  │ Panel      │ │ Actions    │ │ Diff View       │  │   │
│  │  └────────────┘ └────────────┘ └─────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  API Layer (tRPC / Express)                          │   │
│  │  - Workspace CRUD                                    │   │
│  │  - Project scanning (delegates to CLI)               │   │
│  │  - Artifact serving                                  │   │
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

## Data Model Evolution

### New: Workspace (multi-project container)

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

### New: Dashboard Scene Graph

```typescript
// Maps CLI data → 3D scene objects

interface SolarSystem {
  star: StarNode;
  planets: PlanetNode[];
  timestamp: string;
}

interface StarNode {
  workspace: string;
  health_score: number;        // 0-100, aggregate across projects
  total_projects: number;
  total_tools: number;
  total_tokens: number;
  status: "healthy" | "warning" | "critical";
}

interface PlanetNode {
  project: string;
  path: string;
  // Visual properties derived from plan report
  size: number;                // normalized from total_projected tokens
  health: "healthy" | "warning" | "error";
  context_pressure: number;   // 0-1, drives atmosphere thickness
  waste_percentage: number;
  // Orbital elements
  moons: MoonNode[];
  rings: RingNode[];
  satellites: SatelliteNode[];
  debris: DebrisNode[];
  // Source data
  plan_report: PlanReport;
  workspace_view: AgenticWorkspaceView;
}

interface MoonNode {
  instruction: InstructionFile;
  orbit_radius: number;        // derived from depth
  size: number;                // derived from token_count
}

interface RingNode {
  mcp_server: McpEntry;
  width: number;               // derived from tool_count
  brightness: number;          // derived from token_cost
  color: string;               // derived from transport type
  has_gaps: boolean;           // dead capabilities present
  overlap_with?: string[];     // redundancy cluster members
}

interface SatelliteNode {
  skill: SkillEntry;
  size: number;                // derived from token_count
  linked_moon?: string;        // instruction file path if has_instruction
}

interface DebrisNode {
  dead_cap: DeadCapability;
  drift_angle: number;         // random position in orbit
}
```

---

## Interaction Design

### Navigation Flow

```
Workspace (Solar System)
    │
    ├── Zoomed out: all planets visible, orbiting star
    │   ├── Star info panel: workspace name, aggregate metrics
    │   ├── Hover planet: tooltip with project name, health badge
    │   └── Click planet: fly-in transition
    │
    └── Planet Detail (zoomed in)
        ├── Planet surface: project health visualization
        ├── Moons orbiting: instruction files
        │   └── Click moon: side panel with file content, tokens, scope
        ├── Rings: MCP servers
        │   └── Click ring segment: server details, tools list, latency
        ├── Satellites: skills
        │   └── Click satellite: skill content, token cost
        ├── Debris: dead capabilities
        │   └── Click debris: details + "Clear" button (runs optimize)
        └── Toolbar:
            ├── Run Scan (re-scan MCP servers)
            ├── Run Doctor (health check)
            ├── Optimize (clear debris)
            ├── Timeline (historical scrubber)
            └── Compare (side-by-side diff view)
```

### Timeline / History View

- Bottom scrubber bar shows git history timeline
- Dragging scrubber morphs the solar system in real-time
- Planets grow/shrink, moons appear/disappear, rings change
- Uses `agentctl diff` data between commits
- Comets animate across screen at change points

### Comparison Mode

- Split screen: two solar systems side by side
- Same project at different points in time, or two branches
- Delta highlights: pulsing borders on changed elements
- Summary stats overlay showing numeric diffs

---

## Pricing Tiers (Draft)

### Free (OSS CLI)

- Full CLI: scan, plan, doctor, diff, optimize, workspace
- Single-project analysis
- JSON artifact output
- CI/CD integration (diff gates, fail-on flags)
- Community support

### Pro ($X/month per user)

- Everything in Free
- Solar system dashboard (local)
- Multi-project workspaces
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

**Why R3F over alternatives:**
- Component model matches React mental model (each celestial body = component)
- `@react-three/drei` provides orbit controls, text rendering, effects
- `@react-three/postprocessing` for bloom (star glow), depth of field
- Large ecosystem, active community
- Can fall back to 2D canvas for performance-constrained environments

**Key packages:**
- `three` + `@react-three/fiber` — core 3D rendering
- `@react-three/drei` — helpers (OrbitControls, Text, Stars background)
- `@react-three/postprocessing` — bloom, god rays for star
- `framer-motion-3d` or `@react-spring/three` — smooth transitions
- `leva` — debug controls during development

### API Layer: tRPC

**Why tRPC:**
- End-to-end type safety (shared types with CLI)
- Works great with React Query on the frontend
- Lightweight, no code generation needed
- WebSocket subscriptions built-in (for live updates)

### Persistence: SQLite (via better-sqlite3 or Drizzle)

**Why SQLite:**
- Zero setup for local dashboard
- Can upgrade to Turso (distributed SQLite) for SaaS tier
- Stores: workspace configs, historical snapshots, user preferences
- File-based = easy backup, easy bundling

### Monorepo Structure (Proposed)

```
agentctl/
├── packages/
│   ├── core/           # Current CLI (renamed, extracted as library)
│   │   ├── src/
│   │   │   ├── analysis/
│   │   │   ├── config/
│   │   │   ├── mcp/
│   │   │   ├── tokens/
│   │   │   ├── workspace/
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   ├── cli/            # CLI commands (thin shell over core)
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── api/            # API server (tRPC + WebSocket)
│   │   ├── src/
│   │   │   ├── routers/
│   │   │   ├── ws/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── dashboard/      # React + R3F frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── solar-system/
│   │   │   │   │   ├── Star.tsx
│   │   │   │   │   ├── Planet.tsx
│   │   │   │   │   ├── Moon.tsx
│   │   │   │   │   ├── Ring.tsx
│   │   │   │   │   ├── Satellite.tsx
│   │   │   │   │   ├── Debris.tsx
│   │   │   │   │   └── Scene.tsx
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
│   └── shared/         # Shared types between all packages
│       ├── src/
│       │   └── types.ts
│       └── package.json
│
├── workspace.yaml      # Example workspace config
├── pnpm-workspace.yaml
└── package.json
```

---

## Phase Roadmap

### Phase 1 — Local Single-Project Dashboard (MVP)

**Goal:** `agentctl dashboard` opens browser with 3D planet view of current project.

- [ ] Extract core library from CLI (`packages/core`)
- [ ] `agentctl serve` command — local Express/tRPC server
- [ ] React + Vite + R3F frontend scaffolding
- [ ] Single planet view with moons, rings, satellites, debris
- [ ] Inspect panel (click any object → see data)
- [ ] Run CLI commands from UI (scan, doctor, optimize)
- [ ] Data source: `agentctl plan --json` piped to frontend

### Phase 2 — Multi-Project Workspace

**Goal:** Full solar system with multiple planets.

- [ ] `workspace.yaml` config format
- [ ] `agentctl workspace init` scaffolds workspace config
- [ ] Batch scanning across projects
- [ ] Star node with aggregate metrics
- [ ] Solar system view with orbit animations
- [ ] Fly-in/fly-out camera transitions
- [ ] Cross-project redundancy detection

### Phase 3 — Live Monitoring + History

**Goal:** Dashboard stays alive, reacts to changes.

- [ ] File watchers (chokidar) on MCP configs + instruction files
- [ ] Auto re-scan on change → WebSocket push
- [ ] SQLite for historical snapshots
- [ ] Timeline scrubber (git history integration)
- [ ] Trend charts (token budget over time)
- [ ] "Time-lapse" mode — animate system evolution

### Phase 4 — SaaS + Teams

**Goal:** Cloud-hosted multi-user workspaces.

- [ ] Auth (clerk / auth.js)
- [ ] Cloud persistence (Turso / PlanetScale)
- [ ] Team workspaces with role-based access
- [ ] Webhook integrations (Slack, Discord)
- [ ] Shared workspace URLs
- [ ] Billing integration (Stripe)

---

## Open Questions

1. **Should the 3D view have a 2D fallback?** A flat node graph or treemap view
   for accessibility and low-power devices. Probably yes.

2. **How do we handle massive workspaces?** 50+ projects = 50+ planets. LOD
   (level of detail) system? Clustering distant planets? Filtering by tags?

3. **Should the dashboard be an Electron app instead of (or in addition to) a
   browser app?** Electron gives native file system access, system tray icon,
   auto-updates. But browser-first is lower friction.

4. **Real-time MCP server health checks?** Periodic pings to all configured
   servers, update ring brightness/gaps in real-time. Cool but potentially
   expensive.

5. **Can we procedurally generate planet textures from project characteristics?**
   Hash project config into a seed → deterministic but unique planet appearance.
   Each project has a visually distinct planet.

6. **What about the background?** Star field, nebula, constellations? Could map
   constellations to project tag groupings.

7. **Sound design?** Ambient space sounds, UI feedback sounds. Optional but adds
   to the experience. Low priority but high delight.

8. **Mobile experience?** Touch-friendly orbit controls, responsive panels. The
   3D scene should work on tablets at minimum.
