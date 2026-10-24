# eng-standard: agent rules for this repo

This repo is the package that renders AGENTS.md and SHIPPING.md for other repos. It does not render its own (do not
run `eng sync` here). Its own settings live in the root `eng.config.yml`.

## Merge rule (v0.10.0: Matt, 24 Oct 2026, 10:31 AM AEDT; option 2 at 11:22 AM AEDT)

- **No PR needs a human merge, gate changes included.** Every PR merges by GitHub auto-merge
  (`gh pr merge <n> --auto --squash`). Nobody presses merge, Matt included.
- **One config, one required check.** `merge.auto` in `eng.config.yml` holds the rule. The one required check is the
  commit status `eng-merge-gate`. The trusted `.github/workflows/gate.yml` posts it, and that workflow always runs main's
  copy and main's code, with the PR read only as data. It waits for the PR's own `test` check (`ci.yml`), then applies
  `eng merge gate`, so a PR cannot pass or remove its own gate. No job may be named `eng-merge-gate`: GitHub counts a
  skipped required job as passing, and the gate fails any check run that carries the name.
- **Default mode `strict`.** Branch protection requires the PR to be up to date with main (strict required checks). The
  gate needs an independent verifier's PASS for that exact head commit, so every update needs a new verdict.
  `eng merge watch` updates a behind PR that has auto-merge on (a merge from main, never a force push).
- **Mode `queue`: an optional speed-up where the repo has a merge queue** (an org-owned public repo, or private on
  Enterprise Cloud). The PASS binds the patch-id of the queued merge_group commit. `eng doctor` detects which mode the
  repo can run and fails a config that declares the other.
- **Independent verifier.** Not an author, and from a model family other than every author's. Verifiers run
  `eng verdict PASS|PASS+NOTES|FAIL --by <id> --family <f> --provider <p> --pr <n>`. That posts the verdict as a PR comment
  (it survives a lost thread) and re-runs the check. The latest independent verdict decides.
  `merge.auto.verifier_logins` binds verdicts to verifier GitHub identities. Until it is set, verdict identity is
  self-declared and `eng doctor` says so.
- **Second provider for gate, auth and billing.** A PR touching `merge.auto.second_provider_paths` needs PASSes from two
  providers, neither of them an author's provider.
- **Post-merge check, automatic revert.** `.github/workflows/merge-post.yml` runs `scripts/shipped-artifact-check.sh` after
  each merge: the tests, plus the npm-packed artifact installed into a clean project. On failure it opens an
  `auto-revert/<sha12>` PR as `github-actions[bot]`, turns on auto-merge, and dispatches the check with the PR number.
  The gate passes it only as the exact inverse of a commit already on main.
- **Stuck and restart.** `.github/workflows/merge-watch.yml` runs every 10 minutes:
  - A PR whose required check is red or missing, with no activity for 30 minutes, gets the `stuck` label.
  - A FAIL restarts the owning job at once. A missing verdict, or a missing second-provider PASS, restarts it 30
    minutes after the push. The restart is a POST to the `ENG_RESTART_WEBHOOK` secret plus a comment; a failed delivery
    is retried.
- **Nobody bypasses anything**, Matt included: no `--admin`, no `--no-verify`, no ruleset edits around a red or missing
  check. Authors never post their own verdict. Commits carry `Agent:` and `Agent-Family:` trailers.
- **Auto-merge stays armed.** GitHub turns auto-merge off when the required check fails. `eng merge watch` re-arms it once
  the gate passes.
- **Stop one PR:** add the `hold` label (watch disarms auto-merge and leaves it off). **Stop all:** `gh workflow disable ci.yml`.

Details and the GitHub settings (`eng merge settings`): [docs/merge-queue.md](docs/merge-queue.md).
