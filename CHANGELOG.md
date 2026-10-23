# Changelog

Versions follow the commit titles on `main` (`vX.Y.Z: ...`). Minor = new command, config or policy area; patch = rule or doc addition to an existing area. History before 0.7.1 is in `git log`.

## 0.9.0 (23 Oct 2026)

- **Renovation pack** (spec v1, approved by Matt, 23 Oct 2026): `eng renovate` brings an existing repo up to the standard through normal PRs. It never merges, never edits rulesets or protection and never touches prod. Lead guide: `renovation/README.md`.
  - `audit` (read-only; writes only `renovation/audit.json` and `audit.md`), `plan`, and `apply <step>` for seven fixed steps: docs-config, baselines, gates-warn, gates-enforce, verifier, e2e, launch. `apply` refuses the default branch and out-of-order steps, and records `renovation.completed_steps`.
  - Baselines: `renovation/baselines/{secret-filename,lint}.json` (fingerprint, path, reason, owner). `eng renovate scan` and `eng lint` fail only on new findings; baseline edits print every entry and the CODEOWNERS owner; a shrinking baseline is reported as progress.
  - `render [--check]`: SHIPPING.md from the template with repo values, local rules kept between `renovation:local` markers, divergences in `renovation/divergences.md`.
  - `wire --ci buildkite|github` writes a CI snippet and prints the ruleset change for an admin. `ci-preflight` compares Bun/Node pins with the CI image and exits 3 with `needs-decision: ci-image-operator`.
  - `refresh` applies `renovation.merge_policy` (strict or not, verdict carry by patch-id). `receipt` drafts a `core-edge.ship-receipt/v1` review comment (adapter 1) from the latest independent verdict and flags gate-file changes that need a cross-provider reviewer. It never posts.
  - `prove`: per-gate proof ledger `renovation/proof/<sha>.json` with timeouts; timeout or admission is blocked, never pass; resumable.
- `eng launch` / `eng launch down <dir>`: a private 0700 worktree and tmp under `$TMPDIR`; never chmods an existing checkout. Template `launch:` gains `worktree`, `tmp`, `mode`, `base`.
- `eng verdict` records `--provider` (openai, anthropic, google, xai), `--model`, `--session`, `--route`, plus the base tip and head tree. `--base <ref>` / `ENG_BASE` sets the base for stacked PRs.
- Fixes: `eng verify create` and `eng laws` use `os.tmpdir()` instead of a hard-coded `/tmp` (TMPDIR is honoured). The rendered Buildkite pipeline lints against `origin/<project.default_branch>`, not `origin/main`.
- Proof on eng-sandbox only: `docs/evidence/2026-10-23-renovation-pack-sandbox.md`.

## 0.8.3 (20 Oct 2026)

- Fixed rule 20, **Callback contract**, in SHIPPING.md §0 and AGENTS.md (approved by Matt, 19 Oct 2026).
  - Scripts, CI jobs and T3 threads that wake a bot post only when work is done, blocked or needs a decision. No progress pings, no all-clears.
  - The post is one line: `<status> <thread-id> <one short clause>`, status `done`, `blocked` or `needs-decision`. Detail goes in a Core note or file, named by its id.
  - A woken bot reads only that payload and at most the last 2 messages of the named thread. If nothing needs a decision or reply, it exits without a message.
- Fixed rule 21, **Hand off by default**, in SHIPPING.md §0 and AGENTS.md (approved by Matt, 19 Oct 2026).
  - Any coding or bulk job over about 20 steps goes to a T3 thread (builder plus independent verifier). The lead hands it off, ends its run and wakes on the rule-20 `done` or `blocked` callback.
  - Leads check progress with cheap live-state checks (verdict status, CI, `gh pr checks`, `gh pr view`), not by reading whole threads or diffs.
  - Decisions for Matt and client-facing communication stay with the lead.
  - Rollout: tested first on Eng Manager's Fleet Control Tower webhook from 19 Oct; project leads switch on Wed 21 Oct 2026.
- `test/cli.test.mjs` checks rules 20 and 21 in the rendered SHIPPING.md and AGENTS.md.
- Docs and rendered text only; no CLI behaviour change.

## 0.8.2 (19 Oct 2026)

- Fixed rule 19, **Briefs live in Core**, in SHIPPING.md §0 and AGENTS.md (approved by Matt, 19 Oct 2026). Verdicts and audits must be able to see exactly what a builder was told, even after the devbox restarts or `/tmp` is cleaned.
  - A brief one agent hands another (builder, reviewer or verifier thread) is written first as a note in the repo's Core space tagged `brief`; the worker's prompt names the Core note id and may paste the brief inline too.
  - `/tmp` or any other scratch path is never the only copy; a local file is only a convenience copy of the Core note.
  - A revision updates the same note (Core keeps revision history); no second note for r2.
- `test/cli.test.mjs` checks rule 19 in the rendered SHIPPING.md and AGENTS.md.
- Docs and rendered text only; no CLI behaviour change.

## 0.8.1 (19 Oct 2026)

- Fixed rule 18, **Clean up on merge or close**, in SHIPPING.md §0 and AGENTS.md, with details in SHIPPING.md §5 (approved by Matt, 17 Oct 2026). A devbox forensics pass found about 100 GB of agent leftovers.
  - Delete a PR's task and review worktrees when it merges or closes; reuse one worktree per PR across review rounds.
  - Evidence keeps only logs, diffs, verdicts and screenshots (never repo copies, `node_modules`, binaries or databases) and is deleted on merge or close.
  - No `node_modules` installs in review-only worktrees; use a shared pnpm or bun store with hard links.
  - One shared build cache per toolchain (Rust: `CARGO_TARGET_DIR` or `sccache`, `CARGO_INCREMENTAL=0` for agents), not one per lane or worktree.
  - Walkthrough videos and media go off the box (Drive or similar).
  - Temp dirs delete themselves.
- `templates/eng.config.yml`: `hygiene` comment points to rule 18.
- Docs and rendered text only; no CLI behaviour change.

## 0.8.0 (19 Oct 2026)

- **eng-standard merges its own low-risk PRs** (Design A, approved by Matt, 19 Oct 2026, 3:55 PM AEDT). Rule in `AGENTS.md`, details in `docs/self-merge.md`.
  - Root `eng.config.yml` for eng-standard itself: merge rule, `ship.high_risk.paths` (workflows/CI, merge setup, `bin/`, `scripts/`, package scripts and deps, vendored code) and `ship.self_merge` (hold window 120 min, `hold` label, `test` check, `verdict` status).
  - `.github/workflows/risk-label.yml`: labels each PR into main `risk:high` or `risk:low` from its changed paths; a version-only `package.json` / lock bump stays low. Runs main's code only.
  - `.github/workflows/self-merge.yml` (every 30 min + dispatch): squash-merges at most one `risk:low` PR per run with the head SHA pinned, when `test` and `verdict` are green on that SHA for the hold window and there is no `hold` label; never onto a red main. Then deletes the branch and dispatches `ci.yml` on main.
  - `ci.yml` gains `workflow_dispatch` (a GITHUB_TOKEN merge fires no push event).
- New: `eng verdict status --pr <n>`, and `--pr <n>` on `eng verdict PASS|PASS+NOTES|FAIL`: posts commit status `verdict` (success/failure from `eng verdict check`) on the PR's exact head SHA.
- `lib/risk.mjs`, `lib/self-merge.mjs`, `scripts/pr-gate.mjs`; `test/self-merge.test.mjs` covers risk paths, the merge decision and the status post.
- Undo: `gh pr revert <n>`.
