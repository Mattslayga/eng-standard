# @slayteksystems/eng-standard v0 (sandbox only)

One file, `eng.config.yml`, drives everything. Agent-agnostic: plain SKILL.md files in `.agents/skills` (symlinked into `.claude/skills`), AGENTS.md (Codex/Cursor) + CLAUDE.md (`@AGENTS.md`), git hooks, and a Node CLI.

| Command | Does |
|---|---|
| `eng init` | seed eng.config.yml if missing, render everything, set `core.hooksPath .githooks` |
| `eng sync` | re-render; second run prints `no changes` |
| `eng drift-check` | fail if any generated file / symlink / lock differs from what the config renders |
| `eng stack-check` | fail on off-stack language, framework or lockfile without a `stack.exceptions` entry; warns if `ship.merge_queue` is set and no CI workflow triggers on `merge_group` |
| `eng lint` / `eng rules prove` | regex constraints (incl. built-in db-additive-only, flags-default-off); each rule must bite its fixture |
| `eng verify create <id>` | check must FAIL on merge-base and PASS on HEAD; verdict stored as git note on the SHA |
| `eng verify maintain` | re-run all checks N times on HEAD (flaky), staleness, patch-id vs last proof, repeat-mistake → rule |
| `eng mistake <key> <what>` | log a recurring mistake |
| `eng laws` | `bend PROOF.bend` (Bend2) as a gate |
| `eng e2e` | `ta ci` (TesterArmy) with evidence dir per SHA; BLOCKED = fail |
| `eng gate` | every `gates.required`; skipped/blocked = failed |

Vendored upstream skills (verbatim, path-rewritten `.cursor/skills/` → `.agents/skills/`): see `vendor/PINS.txt`. Licenses: MIT (vendor/*/LICENSE).
