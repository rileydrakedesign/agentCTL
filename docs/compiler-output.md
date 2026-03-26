# Compiler Output, CLI Interface, and Input Resolution

## 1. Overview

The compiler produces a **plan artifact** representing a fully resolved, analyzed, and simulated view of an agent’s capability stack.

This is not just terminal output — it is a **structured bundle** that powers:

* CLI output
* CI checks
* PR comments
* dashboard visualization
* historical comparison

---

## 2. Compiler Output Layers

### 2.1 Terminal Summary (Human-readable)

Example:

```
$ agentctl plan

Project: support-agent
Revision: 9f3c2ab
Scan status: PARTIAL
Models: claude-200k, gpt-128k

Context Budget
- Discovery cost: 18,420 tokens
- Typical activation: 46,900 tokens
- Worst-case activation: 97,300 tokens

Capability Summary
- MCP servers: 3
- MCP tools discovered: 28
- Skills found: 6
- Redundant clusters: 2
- Unused capabilities: 5

Warnings
- Slack MCP auth failed: tools could not be listed
- GitHub MCP added 4 tools since last scan
- 3 tools have >90% description overlap
- deploy-prod skill references missing script: scripts/deploy.sh

Recommendations
- Replace Slack MCP with slim Slack messaging skill
- Split deploy-prod skill into deploy-core + rollback
- Remove unused jira_search_legacy
```

---

### 2.2 Artifact Bundle (Source of Truth)

Output directory:

```
.agentctl/
  latest/
    manifest.resolved.json
    scan.json
    plan.json
    diagnostics.json
    recommendations.json
    summary.txt
```

---

### 2.3 Artifact Definitions

#### manifest.resolved.json

* canonical capability graph
* normalized tools, skills, MCP servers
* runtime targets

---

#### scan.json

* raw discovery results
* MCP tool enumeration
* parse results
* auth and connectivity failures

---

#### plan.json

* token budgets
* activation modeling outputs
* model compatibility
* capability cost breakdown

---

#### diagnostics.json

* all issues:

  * auth failures
  * timeouts
  * parse errors
  * missing references

---

#### recommendations.json

* optimization suggestions:

  * consolidation
  * removal
  * replacement
  * restructuring

---

## 3. Compiler Output Schema (High-Level)

```
{
  "status": "partial",
  "project": "support-agent",
  "revision": "9f3c2ab",
  "inputs": {...},
  "resolved": {...},
  "excluded": [...],
  "budgets": {
    "discovery_tokens": 18420,
    "typical_activation_tokens": 46900,
    "worst_case_tokens": 97300
  },
  "issues": [...],
  "recommendations": [...]
}
```

---

## 4. CLI Design

### 4.1 Core Command

```
agentctl plan
```

Equivalent to:

* terraform plan
* compiler "build + analyze"

---

### 4.2 Common Usage

#### Basic run

```
agentctl plan
```

#### Specify models

```
agentctl plan --models claude-200k,gpt-128k,gemini-1m
```

#### JSON output

```
agentctl plan --json
```

#### Custom output dir

```
agentctl plan --out .agentctl/build-001
```

#### Push to backend

```
agentctl plan --push
```

#### CI enforcement

```
agentctl plan --max-discovery-tokens 20000 --fail-on warnings
```

---

### 4.3 Additional Commands

```
agentctl init
agentctl scan
agentctl diff
agentctl doctor
agentctl policy
agentctl push
```

---

## 5. Input Resolution

### 5.1 Auto-discovery (default behavior)

The compiler should automatically find:

#### Config files

* agentctl.yaml
* agent.yaml
* mcp.json
* claude_desktop_config.json

#### Skill directories

* skills/
* .skills/

#### Prompt files

* AGENTS.md
* SYSTEM.md

#### Environment

* .env
* system env variables

---

### 5.2 Explicit Inputs

```
agentctl plan \
  --agent ./agent.yaml \
  --mcp ./mcp.json \
  --skills ./skills \
  --env-file .env.local
```

---

### 5.3 Generated Config

After first run:

```
agentctl.yaml
```

Contains:

* resolved input paths
* runtime targets
* output config

---

## 6. Failure + Auth Handling

### 6.1 Failure Categories

#### Auth failures

* missing API keys
* invalid tokens

#### Connectivity failures

* timeouts
* unreachable servers

#### Discovery failures

* tools/list failed
* partial enumeration

#### Parse failures

* invalid SKILL.md
* malformed JSON

#### Reference failures

* missing files
* broken paths

---

### 6.2 Behavior

Compiler must:

* continue execution when possible
* mark failures explicitly
* degrade gracefully

---

### 6.3 Compile Status

* SUCCESS
* PARTIAL
* FAILED

---

### 6.4 Example Output

```
Compile Status: PARTIAL
Confidence: Medium
Excluded Capabilities: 1
Fallbacks Used: Cached MCP schema
Blocking Issues: 1 auth failure
```

---

### 6.5 Diagnostics Schema

```
{
  "issues": [
    {
      "severity": "error",
      "type": "auth_failure",
      "capability_id": "mcp:slack",
      "message": "Missing SLACK_TOKEN",
      "blocking": true
    }
  ]
}
```

---

## 7. Key Design Principles

1. Output must be both human-readable and machine-readable
2. Compiler should never silently fail
3. Partial results are preferable to hard failure
4. All issues must be surfaced clearly
5. Artifacts are immutable and comparable

---

## 8. Final Definition

The compiler output is:

> a resolved, diagnosed, and simulated representation of an agent system
