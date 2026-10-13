---
name: eng-route
description: "Which skill to use at each stage (plan, build, verify, ship, retro), and how to name it when you spawn or steer a coding thread. Use when starting, spawning or steering a thread, or when unsure which skill fits."
---

# eng route

To use a skill, read `.agents/skills/<name>/SKILL.md` and follow it. Do not rely on description matching or the Skill tool: most skills here are manual-only and will not load on their own.

## Starting or steering a thread

This is the primary path. A lead that spawns or steers a coding thread (for example in T3) names the skill or playbook in the message itself:
- "/poteto-mode, bug-fix playbook: <task>"
- "Read .agents/skills/poteto-mode/SKILL.md first, then use the Feature playbook: <task>"
- When steering mid-task: "Switch to the Shipping playbook" or "Run blast-radius on this diff".

The router below (also in AGENTS.md) is the fallback when no skill was named.

## Router

- **plan:** `poteto-mode` (it picks the playbook: bug-fix, feature, refactoring ...), then `how` / `why` / `architect`; `figure-it-out` for large work; `grilling` / `grill-with-docs` for product calls; `find-the-laws` for rules that must always hold.
- **build:** the playbook steps; `tdd` for bug fixes; `typescript-best-practices` on every .ts/.tsx edit; `show-me-your-work` for long or unattended runs.
- **verify:** `principle-prove-it-works`, the repo `verify-<app>` skill (use it wherever pstack says `control-cli` / `control-ui`), `eng verify create <id>`; `interrogate` for contested design, `blast-radius` for small risky diffs.
- **ship:** the Opening a PR playbook (`no-comments`, then `technical-writing` + `unslop`), then the Babysit and Shipping playbooks.
- **retro:** `eng-retro` (`eng retro`) after each merged PR, then `correct` for any class it finds.
