<!--HDR-->
# SHIPPING.md: how a <REPO> change gets to production

Read this file first, before any other doc in this repo. It is the one shipping SOP. Humans and agents follow the same rules.
If another doc in this repo disagrees with this file, this file wins; fix the other doc in the same PR.
Company name: Slaytek Systems (never "Slaytek" alone).

## 0. Fixed rules (same in every Slaytek Systems repo; do not edit per repo)

1. **Rebase feature branches, never protected ones.** Feature branches are rebased into small ordered commits and onto the base (pstack Opening a PR), then pushed with `git push --force-with-lease`. Protected branches (`main` and any in `project.protected_branches`) are never rebased, force-pushed or deleted. Merges to `main` are squash merges.
2. **No bypass.** Never use `gh pr merge --admin`, `--no-verify`, `enforce_admins` toggles, ruleset edits or any other bypass. The devbox Safe YOLO hook blocks `gh pr merge --admin` as `production.mutate`. If the only way through is a bypass, stop and report it as a GAP.
3. **Independent verifier.** Before merge, an agent that did not write the code, on a different model family (or a different human), drives the change through the repo's `verify-<app>` skill and records `eng verdict PASS|PASS+NOTES|FAIL --by <id> --family <family>`. The verdict binds to the patch-id of base...head (pstack Shipping step 3): a rebase or a merge-in of the base that leaves the patch unchanged keeps the verdict; any change to the patch voids it. CI green is not a verdict. Commits carry `Agent:` and `Agent-Family:` trailers so `eng verdict check` can tell author from verifier.
4. **Skipped = failed.** A missing, skipped, soft-failed, cancelled or unknown check counts as failed.
5. **Flags.** In repos with a flag system, user-facing changes ship behind a flag, off by default. Deploy and release are separate steps.
6. **Database: additive first.** Schema/DB changes are additive and backward-compatible. Destructive changes use expand/contract over at least two deploys (add new shape → move code → backfill → stop reading old → remove old). Never run a `down()` migration as production rollback.
7. **Taste evidence.** UI work produces screenshots or a video of the actual flow for Matt's taste review, posted on the PR.
8. **Repeat mistakes become rules.** A finding seen twice becomes a lint, test or hook, proven against the original mistake.
9. **Merge owner is per repo.** There is no global merge rule. §3 below names who or what merges, with the exact command.
10. **State gaps plainly.** Where no allowed path exists, §7 says GAP. Do not invent a workaround.
11. **Reading a PR is not proof.** Reading a PR does not prove it is shippable. Only running it does: checks on the exact commit, the real app exercised, and evidence posted.
12. **Staging is not mandatory.** Prove changes on a throwaway per-PR or local environment; schema/data changes still get a dry run on a production-shaped copy where the repo has one.
13. **Verify in production.** Ship user-facing changes dark behind a flag, verify on internal/test accounts in prod, then widen; flag off is the first rollback.


## 1. Pick up and do work

To use any skill, read `.agents/skills/<name>/SKILL.md`; do not rely on description matching. The skill router in AGENTS.md (and the `eng-route` skill) is the fallback.

<SPAWN>

1. Branch from current `origin/<BASE>`.
2. Grill the plan before code (`grilling` skill). Architecture and engineering questions are answered first.
3. Edit loop: `<TEST>`.
4. Add a check for the behaviour in `.eng/checks/<id>.sh` and prove it: `eng verify create <id>` (fails on base, passes on HEAD, verdict pinned to the SHA as a git note).

## 2. What must pass before merge (on the exact head SHA)

`<GATE>` runs every required gate in `eng.config.yml` (`gates.required`). A skipped, missing or blocked gate is a failure.
After merging `<BASE>` in, the head is a new SHA: run `eng verify maintain` to re-verify on it.

**E2E is path-based on PRs** (`eng.config.yml` → `e2e.policy`). A PR runs e2e when it touches app code, routes, DB schema/migrations, deps/build config or CI, or is labelled `risk:high`. Docs-only, config-only (non-CI) and test-only PRs skip it: the `e2e` gate passes with `NOT REQUIRED` and the reason. Run `eng e2e-required` to see the decision and which file triggered it. A file no list matches runs e2e.
**`<BASE>` always runs the full e2e after every merge** (and nightly where enabled). That run is the backstop for what PRs skipped. A red e2e on `<BASE>` means the shipping manager reverts the merged PR immediately, before anything else merges; no fix-forward on `<BASE>` (motus #285, 13 Oct 2026).

**Flake rule for e2e.** A new or changed e2e test must pass <FLAKE_RUNS> consecutive runs (`eng.config.yml` → `e2e.flake_runs`) before it may be blocking: `eng e2e --flake-check`. All pass: blocking. All fail: a real failure, fix it. Mixed: flaky, so quarantine it as report-only (not a required check) and open an issue with the traces; it becomes blocking only after it passes <FLAKE_RUNS> in a row. Prove it bites before it blocks (`e2e-flow` skill).

**Required checks are not strict.** Branch rulesets require the gate checks but do NOT require branches to be up to date before merging. Safety comes from the full run on `<BASE>` after every merge plus an immediate revert on red, and the verdict carries over by patch-id.

<RULESET>

## 3. Merge

- **Who merges:** <MERGE_OWNER> (set per repo in `eng.config.yml` → `merge`; there is no global rule).
- **Exact command:** `<MERGE_COMMAND>`.
- **Merge method:** <MERGE_METHOD>.
<SHIP>
## 4. Flags and database

- Flags file: `<FLAGS>`. New flags are added as `false`; `eng lint` rule `flags-default-off` enforces it.
- Migrations: `<MIGRATIONS>`. Additive only; `eng lint` rule `db-additive-only` rejects DROP / RENAME / destructive ALTER. Destructive change = expand/contract over two deploys.

## 5. Disk hygiene (devbox disk hit 92%, 13 Oct 2026)

The shared devbox filled at ~8 GB/hour: per-run test dirs in /tmp were never deleted (Motus vitest/e2e 2-4 GB per run, 44 GB in total; Core Edge fallow-coverage/cli-home fixtures ~8 GB; a stray 34 GB /tmp/node_modules) and 118 T3 worktrees (~70 GB) were never removed when their threads finished.

- **Temp dirs.** Tests, e2e and fallow write only under the per-run dir `$ENG_TMP` (`$TMPDIR/eng-<repo>-<runid>`). `eng gate` and `eng e2e` create it, point `ENG_TMP` and `TMPDIR` at it for every child, and remove it on exit, on failure and on SIGINT/SIGTERM/SIGHUP. Vitest picks it up through `globalSetup: ['./.eng/test-tmp.mjs']`. Test code never writes to bare `os.tmpdir()` or `/tmp`; `eng lint` rule `test-bare-tmpdir` flags it. Never install or copy `node_modules` into /tmp.
- **Stale temp dirs.** A run killed with SIGKILL cannot clean up. `eng clean` lists this repo's `eng-<repo>-*` dirs older than N hours (`--older-than`, default 6) whose process is gone; `eng clean --apply` deletes them.
- **Worktrees.** When a thread settles or its PR merges, the author confirms its commits are pushed (`git status -sb` shows nothing ahead; `git log @{u}..` is empty), then removes its worktree from the main checkout: `eng clean --worktrees --apply`. It removes only worktrees whose branch is merged into `origin/<BASE>` or deleted upstream, AND whose commits are all on the remote, AND that have no uncommitted changes. Everything else is reported, never deleted.
- **Never delete unpushed or dirty worktrees.** Not with `git worktree remove --force`, not with `rm -rf`. Report them to the repo lead with the path, branch and what is unpushed or uncommitted.
- `eng clean` is a dry run by default; read its output before adding `--apply`.

## 6. CI hygiene

<CI_HYGIENE>

## 7. GAPS

1. Server-side enforcement (rulesets, required checks) is not applied by `eng` v0; `eng init` prints the advice in §2 to apply by hand. Local hooks are convenience; `--no-verify` skips them.
