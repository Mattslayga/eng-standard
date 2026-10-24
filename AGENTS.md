# eng-standard: agent rules for this repo

This repo is the package that renders AGENTS.md and SHIPPING.md for other repos. It does not render its own (do not
run `eng sync` here). Its own settings live in the root `eng.config.yml`.

## Merge rule (v0.10.0, decided by Matt, 24 Oct 2026, 10:31 AM AEDT)

- **No PR needs a human merge, gate changes included.** Every PR merges through GitHub's merge queue with auto-merge
  (`gh pr merge <n> --auto --squash`). Nobody presses merge, Matt included.
- **One config, one required check.** `merge.queue` in `eng.config.yml` holds the rule. The one required check is `test`
  (`.github/workflows/ci.yml`). It runs the tests and then `eng merge gate` on `pull_request` and on `merge_group`, using
  main's code and main's config, so a PR cannot pass its own gate.
- **Verdict bound to the patch.** The gate passes only when an independent verifier (not an author, and from a model family
  other than every author's) has recorded a PASS for the exact patch-id that is being merged. Verifiers run
  `eng verdict PASS|PASS+NOTES|FAIL --by <id> --family <f> --provider <p> --pr <n>`, which posts the verdict as a PR comment
  (it survives a lost thread). The latest independent verdict decides, so a FAIL voids earlier passes.
- **Second provider for gate, auth and billing.** A PR touching `merge.queue.second_provider_paths` (workflows, this rule,
  `bin/`, `scripts/`, the merge code, package files, vendored code, `**/auth/**`, `**/billing/**`) also needs a PASS from a
  second verifier on a different provider.
- **Post-merge check, automatic revert.** `.github/workflows/merge-post.yml` runs `scripts/shipped-artifact-check.sh` on
  every merge to main: the tests plus the npm-packed artifact installed into a clean project. If it fails, it opens an
  auto-revert PR (the exact inverse of the merged commit) with auto-merge on. The gate passes an exact inverse without a
  new verdict.
- **Stuck and restart.** `.github/workflows/merge-watch.yml` runs every 10 minutes:
  - A PR whose required check is red or missing, with no activity for 30 minutes, gets the `stuck` label.
  - A FAIL, or no verdict 30 minutes after the head was pushed, restarts the owning job. It POSTs to the
    `ENG_RESTART_WEBHOOK` secret with the `Owner:` line from the PR body, or else the first `Agent:` trailer, and
    leaves a comment.
- **Nobody bypasses anything**, Matt included: no `--admin`, no `--no-verify`, no ruleset edits around a red or missing
  check. Authors never post their own verdict. Commits carry `Agent:` and `Agent-Family:` trailers.
- **Stop one PR:** remove it from the queue (`gh pr merge <n> --disable-auto`). **Stop all:** `gh workflow disable ci.yml`.

Details, the GitHub settings (`eng merge settings`) and the ownership blocker: [docs/merge-queue.md](docs/merge-queue.md).
