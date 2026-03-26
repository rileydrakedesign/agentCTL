# Agent Configuration Intelligence Platform — Updated Spec (v3)

## Status: Updated with Workspace Analysis + MCP Ecosystem Integration

## Date: March 2026

---

# 1. Product Overview

This system is a **configuration intelligence + capability optimization platform** for AI agents.

It operates across:

1. Compose (define capabilities)
2. Simulate (analyze + predict)
3. Optimize (recommend structural changes)
4. Monitor (future phase)

---

## Core Definition

> A compiler + strategy engine that analyzes, simulates, and optimizes an agent’s capability stack before execution.

---

# 2. Core System Layers

## 2.1 Definition Layer

* agent manifests
* MCP configs
* skills
* prompts
* MCP Manager workspaces (NEW)

---

## 2.2 Discovery Layer

* MCP servers
* tools via `tools/list`
* SKILL.md parsing
* workspace-level aggregation (NEW)

---

## 2.3 Intelligence Layer

Includes:

* Capability Analysis
* Context Simulation
* Cost Modeling
* Strategy Engine
* Linting + Quality Analysis
* Workspace Analysis (NEW)

---

# 3. New Core Feature: Workspace Analysis (HIGH PRIORITY)

## 3.1 Purpose

Analyze **aggregated MCP environments** (e.g., MCP Manager workspaces) and answer:

> “Is this workspace overconfigured, inefficient, or redundant?”

---

## 3.2 Inputs

* MCP workspace definition (from MCP Manager or config)
* list of MCP servers
* aggregated tool list
* token costs
* overlap clusters
* (future) usage telemetry

---

## 3.3 System Behavior

The system must:

### 1. Aggregate capabilities across MCPs

* flatten all tools from all servers
* normalize into capability graph

---

### 2. Compute workspace-level metrics

* total MCP count
* total tool count
* effective tools (estimated usage)
* unused tools
* overlap clusters
* total token footprint

---

### 3. Detect inefficiencies

* redundant MCP servers
* unused MCPs
* excessive tool exposure
* context overload

---

### 4. Generate optimization strategies

* split workspace into smaller groups
* remove low-value MCPs
* create task-specific profiles
* recommend routing / filtering

---

## 3.4 Output Example

```json id="workspace01"
{
  "workspace": "dev",
  "mcp_count": 4,
  "tool_count": 83,
  "effective_tools": 11,
  "unused_tools": 62,
  "token_cost": 52000,
  "waste_percentage": 87,
  "issues": [
    "high redundancy",
    "context overload",
    "low utilization"
  ],
  "recommendation": {
    "action": "split_workspace",
    "suggested_structure": [
      "dev-core (12 tools)",
      "dev-extended (71 tools)"
    ]
  }
}
```

---

## 3.5 MCP-Level Cost Attribution

Break down cost by MCP:

```json id="workspace02"
{
  "mcp_costs": {
    "slack": 14000,
    "github": 18000,
    "filesystem": 2000
  }
}
```

---

## 3.6 CLI Integration

```bash id="workspacecmd01"
agentctl plan --workspace dev
```

or

```bash id="workspacecmd02"
agentctl plan --from-mcp-manager dev-workspace
```

---

## 3.7 Dashboard Integration

### New Workspace View

Displays:

* MCP servers
* total tools
* token usage
* waste %
* redundancy clusters

---

### New Workspace Panels

#### 1. Workspace Health

* overall score
* risk indicators

#### 2. MCP Contribution

* tokens per MCP
* tool counts per MCP

#### 3. Waste Analysis

* unused tools
* redundant clusters

#### 4. Suggested Restructure

* split strategies
* filtering recommendations

---

## 3.8 Value

> Enables developers to understand and optimize aggregated MCP environments before they break

---

# 4. Updated Strategy Engine (Now Workspace-Aware)

## Additional Inputs

* workspace-level metrics
* MCP distribution
* tool density per MCP

---

## New Output Capability

```json id="strategy02"
{
  "recommended_strategy": "workspace_partitioning",
  "justification": [
    "multiple MCPs contributing redundant tools",
    "tool density too high"
  ]
}
```

---

# 5. Updated Optimization Features

## 5.1 Workspace-Level Filtering

Recommend:

* removing entire MCPs
* reducing tool exposure per MCP

---

## 5.2 Workspace Partitioning

Split into:

* core workspace
* extended workspace
* task-specific environments

---

## 5.3 MCP Consolidation

Detect:

* overlapping MCP servers
* duplicated tool coverage

---

# 6. Updated Compiler Output

## New Fields

```json id="plan03"
{
  "workspace_analysis": {...},
  "mcp_costs": {...},
  "workspace_waste": 0.87
}
```

---

# 7. Updated CLI Surface

## New Commands

```bash id="cli04"
agentctl plan --workspace <name>
agentctl plan --from-mcp-manager <workspace>
```

---

## Example

```bash id="cli05"
agentctl plan --workspace dev --strategy
```

Outputs:

* workspace breakdown
* MCP cost attribution
* optimization strategy

---

# 8. Updated Product Definition

## Expanded

> We analyze and optimize both individual agents and entire MCP workspaces.

---

## Final One-liner

> “Understand and optimize your entire agent capability stack—including all MCPs—before execution.”

---

# 9. Strategic Positioning (Updated)

| Category | MCP Manager         | This Product              |
| -------- | ------------------- | ------------------------- |
| Purpose  | manage MCPs         | analyze MCPs              |
| Focus    | setup + config      | optimization + efficiency |
| Output   | working environment | optimized environment     |
| Value    | ease of use         | performance + cost        |

---

# 10. Key Insight

> MCP Managers make it easy to add tools
> This system makes it clear which tools you should remove

---

# 11. Priority Update

## Phase 1

* CLI + simulation
* capability analysis

---

## Phase 2

* strategy engine
* linting

---

## Phase 3

* workspace analysis (HIGH PRIORITY)
* MCP cost attribution

---

## Phase 4

* telemetry + runtime comparison

---

# 12. Final Principle

> The more tools a system has, the more valuable this product becomes
