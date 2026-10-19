# eng-standard: agent rules for this repo

This repo is the package that renders AGENTS.md and SHIPPING.md for other repos. It does not render its own (do not
run `eng sync` here). Its own settings live in the root `eng.config.yml`.

## Merge rule (approved by Matt, 19 Oct 2026, 3:55 PM AEDT)

- **risk:low PRs merge themselves.** `.github/workflows/self-merge.yml` squash-merges a PR into `main` only when it has
  `risk:low`, no `hold` label, the `test` check is green and the `verdict` status is success on the current head SHA,
  and both have been green for the hold window (`ship.self_merge.hold_minutes`, default 120). One merge per run.
- **risk:high PRs wait for Matt**, who merges by hand. A PR is risk:high when any changed path matches
  `ship.high_risk.paths` in `eng.config.yml` (workflows and CI, this merge setup, `bin/`, `scripts/`, package
  scripts and dependencies, vendored code). `.github/workflows/risk-label.yml` sets the label on every push.
- **Nobody bypasses anything**, Matt included: no `--admin`, no `--no-verify`, no merging around a red or missing check.
  Authors never merge their own PR and never post its verdict.
- **Verdict:** an independent checker from a model family other than every author's posts `verdict` for the exact head
  SHA. Authors put `Agent:` and `Agent-Family:` trailers on every commit so `eng verdict check` can tell.
- **Stop one PR:** add the `hold` label. **Stop all:** `gh workflow disable self-merge.yml`.
- **Undo:** `gh pr revert <n>` (one step: opens the revert PR, which goes through the same gates).

Details, the checker command and the GitHub settings: [docs/self-merge.md](docs/self-merge.md).
