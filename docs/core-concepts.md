# Core Concepts: Compiler, Simulation, Tokens, Traces, and Runtime Intelligence

## 1. The Compiler

The compiler transforms:

```
agent configuration → structured, analyzable system
```

---

### Compiler Pipeline

1. Parse
2. Resolve
3. Normalize
4. Analyze
5. Simulate
6. Output

---

### Output

* capability graph
* token budgets
* diagnostics
* optimization suggestions

---

## 2. Activation Modeling

### Definition

Activation modeling estimates:

> which capabilities are used during execution

---

### Three Modes

#### Discovery

* baseline context load

#### Typical

* expected real-world usage

#### Worst-case

* maximum activation scenario

---

## 3. Heuristics

Heuristics approximate behavior.

### Core Heuristics

1. Text similarity → relevance
2. Historical usage → frequency
3. Skill bundling → group activation
4. Dependency chains → linked tools
5. Context pressure → suppression

---

## 4. Token Counting

### Process

1. tokenize text
2. count tokens

---

### Counted Elements

* tool descriptions
* schemas
* skill instructions
* prompts

---

### Types

#### Discovery tokens

* always loaded

#### Activation tokens

* loaded when used

---

### Model Differences

* GPT, Claude, Gemini differ
* use base tokenizer + scaling factors

---

## 5. MCP Auth Handling

### Requirements

* API keys
* OAuth tokens
* env variables

---

### Strategy

1. inherit environment
2. config-based auth
3. pass-through execution
4. graceful failure handling

---

## 6. Instrumentation vs Integration

### Instrumentation

* adding tracking inside code

### Integration

* connecting to external systems

---

## 7. Event Model

### Core Events

#### Run

* full execution

#### Step

* tool or LLM action

#### Outcome

* result

#### Cost

* token + USD usage

---

### Principles

* consistent schema
* timestamped
* linked by IDs

---

## 8. Traces

### Definition

A trace is:

> the full execution path of an agent run

---

### Example

```
User query
→ LLM call
→ Tool call
→ LLM call
→ Output
```

---

### Extracted Insights

* tool usage frequency
* cost per step
* failure points
* execution order

---

## 9. System Synthesis

The platform combines:

### Compiler

* understands config

### Simulator

* predicts behavior

### Trace Analyzer

* observes reality

### Intelligence Layer

* optimizes system

---

## 10. Final Concept

This system does not run agents.

It:

> understands, predicts, and improves them
