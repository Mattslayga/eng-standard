# Changelog

Versions follow the commit titles on `main` (`vX.Y.Z: ...`). Minor = new command, config or policy area; patch = rule or doc addition to an existing area. History before 0.7.1 is in `git log`.

## 0.8.0 (19 Oct 2026)

- **eng-standard merges its own low-risk PRs** (Design A, approved by Matt, 19 Oct 2026, 3:55 PM AEDT). Rule in `AGENTS.md`, details in `docs/self-merge.md`.
  - Root `eng.config.yml` for eng-standard itself: merge rule, `ship.high_risk.paths` (workflows/CI, merge setup, `bin/`, `scripts/`, package scripts and deps, vendored code) and `ship.self_merge` (hold window 120 min, `hold` label, `test` check, `verdict` status).
  - `.github/workflows/risk-label.yml`: labels each PR into main `risk:high` or `risk:low` from its changed paths; a version-only `package.json` / lock bump stays low. Runs main's code only.
  - `.github/workflows/self-merge.yml` (every 30 min + dispatch): squash-merges at most one `risk:low` PR per run with the head SHA pinned, when `test` and `verdict` are green on that SHA for the hold window and there is no `hold` label; never onto a red main. Then deletes the branch and dispatches `ci.yml` on main.
  - `ci.yml` gains `workflow_dispatch` (a GITHUB_TOKEN merge fires no push event).
- New: `eng verdict status --pr <n>`, and `--pr <n>` on `eng verdict PASS|PASS+NOTES|FAIL`: posts commit status `verdict` (success/failure from `eng verdict check`) on the PR's exact head SHA.
- `lib/risk.mjs`, `lib/self-merge.mjs`, `scripts/pr-gate.mjs`; `test/self-merge.test.mjs` covers risk paths, the merge decision and the status post.
- Undo: `gh pr revert <n>`.
