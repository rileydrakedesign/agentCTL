---
name: audit-agent-context
description: Audit an AI agent project's context surface with agentctl. Use when a project has MCP servers, CLAUDE.md/AGENTS.md or skills and you need to know how many tokens they cost, which tools overlap or are dead, and whether the config is healthy before an agent runs.
---
# Audit agent context

Run this when a user asks "how much context is my setup using", "which MCP tools are
redundant", "is my MCP config broken", or before adding another MCP server to a project.

## Prerequisites

Node 20 or newer. Run every command from the project root (the directory that holds
`.mcp.json`, `CLAUDE.md`, `AGENTS.md` or a `skills/` folder).

Use the CLI without installing it:

```
npx -y -p @rileydrakedesign/agentctl agentctl --version
```

If the package is installed globally, drop the `npx -y -p @rileydrakedesign/agentctl` prefix
and call `agentctl` directly. The rest of this skill writes the short form.

## Steps

1. **Check config health first.**

   ```
   agentctl doctor
   ```

   Good output: every line starts with `v` and the summary ends `0 failed`. It confirms
   `agentctl.yaml` (if present), the discovered MCP config, env vars the servers need,
   server connectivity and prompt files. If there is no `agentctl.yaml`, run
   `agentctl init --name <project>` once; it only scaffolds the file and is safe to re-run.

2. **Discover what the agent can see.**

   ```
   agentctl scan
   ```

   Good output: one row per MCP server with a tool count and token estimate, plus the
   skills and prompt files found. Pass `--json` to get the same data as JSON on stdout.
   Pass `--config <path>` if the MCP config is somewhere other than `.mcp.json` or the
   user-level Claude config.

3. **Run the full analysis.**

   ```
   agentctl plan
   ```

   Add `--models claude-sonnet-4-6,gpt-4o` to budget against specific context windows,
   `--cached` to reuse the last scan, and `--json` for machine-readable output.

4. **Read the report** (sections appear in this order):

   - **Discovery**: server, tool, skill and prompt-file counts. `Status: FAILED` or
     `partial` means at least one server did not answer; the cause is in step 1's output.
   - **Token Budget**: a table per model. `Discovery` is the always-loaded cost of tool
     definitions. `Total (typical)` assumes 30% of tools activate. Over 50% of the
     smallest context window is a problem worth reporting to the user.
   - **Context Surface**: the same cost split into layers (root instruction, project
     config, skills, MCP) so the user can see which layer dominates.
   - **Reference Graph**: how many instruction files link to each other. Unlinked files
     are candidates for deletion or for an `@` reference from the root file.
   - **Workspace**: redundancy clusters (tool pairs above 80% description similarity) and
     estimated waste as a percentage of discovery tokens.
   - **Recommendations**: `!` lines are warnings, `✗` lines are errors. Each names the
     server and tool. Relay these verbatim; they are the action items.

   Everything is also written to `.agentctl/latest/` (`scan.json`, `plan.json`,
   `diagnostics.json`, `recommendations.json`, `summary.txt`). Read `recommendations.json`
   when you need the findings as data.

5. **Summarize for the user**: total tokens and percent of the smallest window, the
   single largest MCP server, the number of redundancy clusters, and the recommendations.
   Do not edit `.mcp.json` or remove servers unless the user asks.

## In CI

```
agentctl plan --fail-on warning
agentctl plan --max-discovery-tokens 50000
```

Both exit non-zero on a violation, so they work as a gate in any pipeline.

## When a command fails

- `No MCP servers configured`: there is no `.mcp.json` in the project and no user-level
  config. Ask the user where their MCP config lives and pass `--config <path>`.
- A server shows as unreachable or times out: run `agentctl doctor`, check the env vars it
  lists as missing, and confirm the server command runs on its own (for example
  `npx -y <server-package>`). Re-run `agentctl plan` afterwards; do not pass `--cached`
  until the scan succeeds.
- `agentctl plan --cached` complains there is no previous scan: run `agentctl scan` first.
- `npx` cannot find the package: the user is offline or behind a registry proxy. Clone
  `https://github.com/rileydrakedesign/agentCTL`, run `pnpm install && pnpm build`, and call
  `node dist/index.js <command>` from that checkout instead.
