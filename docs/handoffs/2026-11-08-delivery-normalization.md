# Handoff: normalize this repo's delivery around skills

Give this file to the agent in each of `agentctl`, `jev-surfer` and `wikiforge`. Run in
goal mode. The goal is the stop condition at the end; do not stop before it is met and do
not go past it.

## Goal

Make this repo ship the way the most-starred agent tools ship in late 2026: a public GitHub
repo whose user-facing unit is a `skills/` folder in the Agent Skills format, wrapped in a
plugin manifest so Claude Code, Codex and Cursor can install it, with the language-specific
installer (npm or uv) underneath for the parts that run as code. One shape for all three
repos. Do not redesign the tool. Do not add features. Do not over-engineer.

## Why

Survey of nine top repos (superpowers, mattpocock/skills, ECC, gstack, caveman, anthropics/
skills, claude-code-templates, pstack, vercel-labs/skills): every one ships from a GitHub repo
of `SKILL.md` folders; plugin manifests give pinned versions and updates; `npx skills add`
covers every other host; npm is used only for installers. Full notes:
`personal_kb/wiki/syntheses/tool-delivery-patterns.md`.

## Target layout

```
<repo>/
  skills/
    <skill-name>/SKILL.md        one folder per skill; name matches folder; see format below
  .claude-plugin/
    plugin.json                  {"name": "<slug>", "version": "0.1.0", "description": ..., "author": {"name": "Riley Drake"}, "repository": "<repo url>", "license": "MIT"}
    marketplace.json             {"name": "<slug>", "owner": {"name": "Riley Drake"}, "plugins": [{"name": "<slug>", "source": "./", "description": ...}]}
  plugin.json                    {"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", "name": "<slug>", "version": "0.1.0", "description": ...}
  LICENSE                        MIT, Riley Drake, current year
  README.md                      install section as specified below, near the top
  AGENTS.md                      what an agent needs to know to work in this repo; CLAUDE.md becomes one line: "@AGENTS.md"
  <existing code, tests, CI, docs unchanged>
```

Naming rule: `<slug>` is the repo name in kebab-case and is used for the plugin name, the
marketplace name and the published package name. The CLI binary may keep its short name.
Keep `version` identical in `.claude-plugin/plugin.json`, root `plugin.json` and the package
manifest.

## SKILL.md format

```
---
name: <skill-name>            # lowercase, hyphens, equals the folder name
description: <what it does and when to use it, one or two sentences, under 1024 chars>
---
# <Title>

When to use. Steps. What to run (exact commands). What good output looks like. What to do
when the command fails.
```

Under 500 lines. Reference other files in the skill folder by relative path, one level deep.
Write it harness-neutral: no Claude-only or Cursor-only steps. If a step needs one host, say
`skip on other hosts` on that line.

## README install section

Put this block after the one-paragraph intro, filled in for this repo, in this order.
Keep only paths that work today; leave a path out rather than ship a broken line.

```
## Install

Claude Code:   claude plugin install <slug> --marketplace rileydrakedesign/<repo>
Codex:         codex plugin marketplace add rileydrakedesign/<repo>   then install <slug> from /plugins
Cursor:        /add-plugin <slug>   (once listed)   or add this repo under Customize > Plugins
Any agent:     npx skills add rileydrakedesign/<repo>
CLI only:      <npm or uv command>
```

## Per-repo notes

**agentctl.** Package is named `agent-ctl` and has never been published; the npm name
`agentctl` is held by an unrelated 2024 alpha, so `pnpm install -g agentctl` in the README is
wrong. Rename the package to `@rileydrakedesign/agentctl` (bin stays `agentctl`), fix every
install line, add `LICENSE`. First skill: `audit-agent-context`, which runs `agentctl scan`,
`agentctl plan` and `agentctl doctor` and explains how to read the report. The publish
workflow already fires on `v*` tags; do not create the tag.

**jev-surfer.** The README says "design phase, no code yet" and is wrong; describe the
current state in one paragraph. `pyproject.toml` name stays `jev-surfer`, bin stays `surf`,
plugin slug `jev-surfer`. Add `LICENSE`. First skill: `route-context`, which runs `surf` for a
task and tells the agent how to use the pointer note; a second skill `surf-hook` documents the
Claude Code hook adapter and marks it `skip on other hosts`. Add a minimal CI workflow
(`uv sync`, `ruff check`, `pytest`) since none exists.

**wikiforge.** Package `wforge-cli` 0.1.0 is published; keep it. The 22 skills are Handlebars
templates (`templates/**/*.SKILL.md.hbs`) rendered by the scaffolder. Do not convert all of
them. Pick the three that work without a scaffolded wiki (maintenance or help skills that
only need a markdown folder), write them as real un-templated skills under `skills/`, and
leave the rest as templates. Plugin slug `wikiforge`.

## Rules

- Smallest diff that meets the stop condition. No refactors of existing code.
- Do not publish to npm, PyPI, any plugin directory or skills.sh. Do not create git tags.
  Those are Riley's steps and are listed in the PR body as follow-ups.
- Do not touch `.env`, secrets, or CI secrets.
- Work on a branch `delivery/skills-normalization`. One PR. Do not merge.
- If a required name decision is genuinely blocked (a package name is taken and no scoped
  form is possible), stop and report instead of inventing a name.

## Stop condition

All of these true, verified by running them, with the output quoted in the PR body:

1. `claude plugin validate .` passes.
2. `claude --plugin-dir . -p "list the skills you have from this plugin"` names every skill
   in `skills/`.
3. `npx skills add . --list` (or `npx skills add <local path>`) shows every skill in `skills/`.
4. Every SKILL.md has `name` equal to its folder and a non-empty `description`, checked with
   a one-line shell loop.
5. The three manifests carry the same `version`; `LICENSE` and `AGENTS.md` exist; `CLAUDE.md`
   is `@AGENTS.md`.
6. The README install section contains only commands that were run or are host commands that
   cannot be run here (Cursor and Codex UI steps), and the per-repo notes above are done.
7. Existing tests still pass with the repo's own test command.
8. PR is open against `main` with the verification output and the follow-up list: tag
   `v0.1.0`, publish the package, submit to the Claude, Codex and Cursor directories.

When all eight hold, post the PR link and stop.
