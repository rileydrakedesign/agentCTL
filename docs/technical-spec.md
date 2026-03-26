# Agent Configuration Intelligence Platform
## Technical Spec + Architecture + UX Blueprint

**Status:** Ready for initial development  
**Date:** March 2026  

---

# 1. Product Overview

This system is a **configuration intelligence platform for AI agents**.

It operates across three phases of the agent lifecycle:

1. Compose (define agents, MCPs, skills)
2. Simulate (pre-execution capability + cost analysis)
3. Monitor (runtime economics + drift)

---

## Core Positioning

This is NOT:
- an orchestration framework
- an observability tool
- a protocol layer

This IS:
- a **configuration compiler + simulation engine + intelligence layer**

---

## Core Insight

Developers lack visibility into:

- context usage BEFORE execution
- capability redundancy
- cost-per-successful-outcome
- how configuration decisions impact runtime economics

---

# 2. System Architecture

## 2.1 Conceptual Layers

### 1. Definition Layer
User-declared configuration:
- agent manifest
- MCP configs
- skills (SKILL.md)
- prompts
- runtime targets

---

### 2. Discovery Layer
System-discovered data:
- MCP servers
- tools via `tools/list`
- skill metadata
- token estimates
- overlaps

---

### 3. Telemetry Layer
Runtime data:
- traces
- tool usage
- retries
- failures
- token usage
- costs
- outcomes

---

### 4. Intelligence Layer (CORE DIFFERENTIATOR)
Derived insights:
- context simulation
- optimization recommendations
- cost modeling
- redundancy detection
- drift tracking

---

# 3. Data Model

## 3.1 Core Entities

- Workspace
- Project
- AgentDefinition
- Revision
- RuntimeTarget
- Capability
- CapabilityInstance
- Scan
- Plan
- TraceSummary
- OptimizationSuggestion

---

## 3.2 Capability Types

Each capability has a type:

- mcp_server
- mcp_tool
- skill
- agent
- memory_bundle
- prompt_module

---

## 3.3 Key Distinction

Capability = canonical entity  
CapabilityInstance = usage within a specific project/revision  

---

# 4. Scanning Model

## 4.1 Hybrid Approach

### Live Scan (source of truth)
Used for:
- CLI runs
- CI checks
- initial onboarding

### Internal Database (memory layer)
Stores:
- scan snapshots
- normalized capabilities
- token metrics
- usage history
- drift data
- cost predictions vs actual

---

## 4.2 Scan Flow

### Phase 1: Load Inputs
- agent manifest
- MCP configs
- skill directories
- runtime targets

### Phase 2: Resolve Capabilities
- discover MCP servers
- call `tools/list`
- parse SKILL.md
- normalize capabilities

### Phase 3: Estimate Budgets
- discovery cost
- activation cost
- per-profile cost
- growth envelope

### Phase 4: Analyze Structure
- overlap detection
- dead capabilities
- redundancy
- context-heavy clusters

### Phase 5: Generate Outputs
- plan report
- JSON artifact
- optimization suggestions

---

# 5. CLI Design

## 5.1 Philosophy

CLI = **compiler + simulator**

Must be fully usable without dashboard.

---

## 5.2 Commands

### Initialize project
```

agentctl init

```

### Scan capabilities
```

agentctl scan

```

### Simulate (CORE)
```

agentctl plan --models claude-200k,gpt-128k,gemini-1m

```

Outputs:
- context budget
- capability breakdown
- optimization suggestions

---

### Diff revisions
```

agentctl diff --base main --head feature-branch

```

---

### Diagnose issues
```

agentctl doctor

```

---

### Policy enforcement
```

agentctl policy

```

---

### Upload results
```

agentctl push

```

---

## 5.3 Output Format

Terminal output should include:
- summary banner
- capability table
- warnings section
- optimization section

Optional:
```

--json

```

---

# 6. API Design

## 6.1 Domains

### Definitions
- POST /projects
- POST /projects/{id}/revisions
- GET /projects/{id}/manifest

---

### Simulation
- POST /scans
- POST /plans
- GET /plans/{id}
- POST /diffs

---

### Telemetry
- POST /telemetry/traces
- POST /telemetry/runs
- POST /telemetry/outcomes
- POST /telemetry/costs

---

### Intelligence
- GET /projects/{id}/recommendations
- GET /projects/{id}/capabilities
- GET /projects/{id}/economics
- GET /projects/{id}/drift

---

### Policy
- POST /policies
- POST /policies/evaluate

---

## 6.2 Key Principle

Plans and scans are **immutable artifacts**.

---

# 7. Dashboard UX

## 7.1 Design Principle

Dashboard is NOT trace-first.  
Dashboard is **stack-first**.

---

## 7.2 Pages

### Home (Portfolio View)
Shows:
- health score
- context usage %
- cost drift
- recent changes

---

### Project Overview

Top:
- project name
- active revision
- health score
- last scan

---

## 7.3 Tabs

### 1. Stack (CORE VISUAL)

Graph of:
- agent
- MCP servers
- tools
- skills

Each node shows:
- token weight
- usage %
- redundancy

---

### 2. Plan (Simulation)

Displays:
- context budget bars
- model fit matrix
- activation scenarios
- optimization suggestions

---

### 3. Runtime

Displays:
- predicted vs actual cost
- cost per successful outcome
- failure rates
- expensive capabilities

---

### 4. Changes

Shows:
- revision timeline
- capability diffs
- token deltas
- drift events

---

# 8. Core UI Components

## Context Budget Meter
Shows:
- discovery usage
- activation usage
- remaining capacity

---

## Capability Heatmap
Columns:
- tokens
- usage %
- fail rate
- cost contribution

---

## Overlap Clusters
Groups similar tools/skills.

---

## Cost Delta Chart
Predicted vs actual.

---

## Drift Feed
Example:
- "Slack MCP added 4 tools"
- "Discovery budget increased 18%"

---

# 9. Intelligence Features

## 9.1 Capability Optimization
- detect redundancy
- suggest consolidation
- identify dead weight

---

## 9.2 Context Modeling
- discovery vs activation
- task profiles
- growth curves

---

## 9.3 Economics Engine
- cost per outcome
- retry overhead
- per-capability cost attribution

---

## 9.4 Drift Detection
- config changes
- MCP updates
- skill changes

---

# 10. Product Tiers

## Local (OSS)
- CLI
- local scans
- JSON output

---

## Team (Cloud)
- dashboard
- history
- drift tracking
- PR checks

---

## Enterprise
- SSO
- policy enforcement
- audit logs
- private deployments

---

# 11. MVP Scope

## Phase 1
- CLI: scan + plan
- context simulation
- basic dashboard (Stack + Plan)

---

## Phase 2
- diff + PR integration
- policy checks
- drift tracking

---

## Phase 3
- runtime ingestion
- cost-per-outcome
- advanced optimization

---

# 12. Key Product Principles

1. CLI-first, dashboard-second  
2. live scan + persisted intelligence  
3. configuration is source of truth  
4. distinguish declared vs discovered vs observed  
5. recommendations must be explainable  

---
