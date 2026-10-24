# eng-standard: agent rules for this repo

This repo is the package that renders AGENTS.md and SHIPPING.md for other repos. It does not render its own (do not
run `eng sync` here). Its own settings live in the root `eng.config.yml`.

## Merge rule (approved by Matt, 19 Oct 2026, 3:55 PM AEDT; two-provider rule 24 Oct 2026, 3:03 PM AEDT)

- **Self-merge.** `.github/workflows/self-merge.yml` runs main's code only and squash-merges at most one PR into
  `main` per run. Every condition below must hold on the PR's current head SHA:
  - The head contains main's tip (ancestry check). A behind branch is updated and its new head verified again.
  - The `test` check is green and the `verdict` status is success.
  - **risk:low:** one PASS for that exact head from a verifier who wrote none of the commits and whose model family
    differs from every author's.
  - **risk:high:** PASSes for that exact head from two verifiers on two different providers, neither the authors'
    provider. A PR is risk:high when any changed path matches `ship.high_risk.paths` in `eng.config.yml`: workflows
    and CI, this merge setup, `bin/`, `scripts/`, package scripts and dependencies, vendored code, and auth or
    billing paths. `.github/workflows/risk-label.yml` sets the label on every push, and self-merge recomputes it.
  - No verdict, a verdict for another head, or a FAIL refuses the merge. Each verifier's latest verdict counts, and
    any FAIL blocks.
  - No `hold` label and not draft. Everything has been green for the hold window (`ship.self_merge.hold_minutes`,
    default 120).
- **Post-merge check.** After each merge self-merge runs `ci.yml` on `main`. If it fails, the next run opens the merged
  commit's exact inverse as an `auto-revert/<sha12>` PR from `github-actions[bot]`. While main is red it is the only PR
  that may merge, and it still needs every condition above.
- **Nobody bypasses anything**, Matt included: no `--admin`, no `--no-verify`, no merging around a red or missing check.
  Authors never merge their own PR and never post its verdict.
- **Verdict:** each verifier runs `eng verdict PASS|FAIL --by <id> --family <f> --provider <p> --pr <n>` on the exact
  head. That posts an `eng-verdict/v1` PR comment (head SHA, family, provider) and the `verdict` status. Authors put
  `Agent:` and `Agent-Family:` trailers on every commit so the gate can tell who wrote the patch.
- **Stop one PR:** add the `hold` label. **Stop all:** `gh workflow disable self-merge.yml`.
- **Undo:** `gh pr revert <n>` (one step: opens the revert PR, which goes through the same gates).

Details, the checker command and the GitHub settings: [docs/self-merge.md](docs/self-merge.md).
