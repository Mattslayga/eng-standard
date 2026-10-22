# @slayteksystems/eng-standard v0 (sandbox only)

One file, `eng.config.yml`, drives everything. Agent-agnostic: plain SKILL.md files in `.agents/skills` (symlinked into `.claude/skills`), AGENTS.md (Codex/Cursor) + CLAUDE.md (`@AGENTS.md`), git hooks, and a Node CLI.

| Command | Does |
|---|---|
| `eng init` | seed eng.config.yml if missing, render everything, set `core.hooksPath .githooks`; prints the branch ruleset advice (non-strict required checks) |
| `eng sync` | re-render; second run prints `no changes` |
| `eng drift-check` | fail if any generated file / symlink / lock differs from what the config renders |
| `eng stack-check` | fail on off-stack language, framework or lockfile without a `stack.exceptions` entry; warns if `ship.merge_queue` is set and no CI workflow triggers on `merge_group` |
| `eng stack-audit [<name>=<path>...]` | read-only: compare declared deps, `packageManager` and CI Bun/Node pins at `origin/main` (`--ref`) against the Modern Stack floors in `standard/modern-stack.yml`; exit 1 on drift. `--json` prints findings, `--core` prints Core follow-up inputs and never sends them. See `docs/modern-stack.md` |
| `eng lint` / `eng rules prove` | regex constraints (incl. built-in db-additive-only, flags-default-off); each rule must bite its fixture |
| `eng verify create <id>` | check must FAIL on merge-base and PASS on HEAD; verdict stored as git note on the SHA |
| `eng verify maintain` | re-run all checks N times on HEAD (flaky), staleness, patch-id vs last proof, repeat-mistake → rule |
| `eng mistake <key> <what>` | log a recurring mistake |
| `eng laws` | `bend PROOF.bend` (Bend2) as a gate |
| `eng e2e [--if-required]` | `e2e run` (tester-army/e2e) with evidence dir per SHA; BLOCKED = fail. `--if-required` (used by gate and CI) passes as NOT REQUIRED when `e2e.policy` says the diff does not need e2e |
| `eng e2e --flake-check` | flake rule: runs `eng e2e` `e2e.flake_runs` times (default 3; `--runs N`). All pass = BLOCKING (exit 0); mixed = QUARANTINE (exit 11: report-only + issue); all fail = FAIL. `--results pass,fail,...` classifies existing runs. Authoring templates: `templates/e2e/` |
| `eng e2e-required` | prints whether e2e is required for this diff and why (`--event pr\|main\|nightly`, `--base`, `--files`, `--labels`, `--json`, `--exit-code` = 10 when not required). PRs are path-based; main after merge and nightly always run the full suite |
| `eng clean` | disk hygiene, dry run by default (`--apply` acts). Removes this repo's stale `$ENG_TMP` dirs (`eng-<repo>-*` older than `--older-than` hours, default 6, process gone). `--worktrees`: removes git worktrees whose branch is merged or deleted upstream AND fully pushed AND clean; reports the rest, never deletes them. `eng gate` / `eng e2e` run every child with `ENG_TMP`/`TMPDIR` set to a per-run dir removed on exit, failure or signal; lint rule `test-bare-tmpdir`; vitest globalSetup `.eng/test-tmp.mjs` |
| `eng gate` | every `gates.required`; skipped/blocked = failed |
| `hooks.pre_commit`, `agents.post_edit_command` | optional config. `.githooks/pre-commit` runs each `hooks.pre_commit` command in its own `sh -c` after drift-check, stack-check and lint, and stops at the first failure. `agents.post_edit_command` becomes a Claude Code `PostToolUse` hook in `.claude/settings.json` for `Edit\|MultiEdit\|Write`; exit code 2 returns its stderr to the agent. Unset keys render the same files as before |
| `stack.defaults.agent_activity_ui` | STACK.md default: agent or AI activity shown to users (reasoning, tool calls, subagents, queues) uses shadcn Trace (`pnpm dlx shadcn@latest add trace`), plus AI Elements / Code Block where relevant, not custom UI. Docs: https://ui.shadcn.com/docs/components/trace |
| `eng renovate audit\|plan\|apply <step>\|render\|baseline\|scan\|wire\|ci-preflight\|refresh\|receipt\|prove` | renovation pack for existing repos: audit against the standard, seven fixed adoption steps as normal PRs, baselines, CI preflight, receipt drafts, proof ledger. Never merges or edits rulesets. See `renovation/README.md` |
| `eng launch [--ref r]` / `eng launch down <dir>` | private 0700 worktree + tmp under `$TMPDIR`; never chmods an existing checkout |
| `npm test` | this package's own tests (`node --test`) |

Vendored upstream skills (verbatim, path-rewritten `.cursor/skills/` → `.agents/skills/`): see `vendor/PINS.txt`. Licenses: MIT (vendor/*/LICENSE).
