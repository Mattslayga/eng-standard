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
9. **Merge owner is per repo.** There is no global merge rule. §4 below names who or what merges, with the exact command.
10. **State gaps plainly.** Where no allowed path exists, §9 says GAP. Do not invent a workaround.
11. **Reading a PR is not proof.** Reading a PR does not prove it is shippable. Only running it does: checks on the exact commit, the real app exercised, and evidence posted.
12. **Staging is not mandatory.** Prove changes on a throwaway per-PR or local environment; schema/data changes still get a dry run on a production-shaped copy where the repo has one.
13. **Verify in production.** Ship user-facing changes dark behind a flag, verify on internal/test accounts in prod, then widen; flag off is the first rollback.


## 1. Pick up and do work

Name the skill. A lead that spawns or steers a coding thread (e.g. T3) names the skill or playbook in the message: "/poteto-mode, bug-fix playbook" or "read .agents/skills/poteto-mode/SKILL.md first". This is the primary path; the skill router in AGENTS.md (and the `eng-route` skill) is the fallback. To use any skill, read `.agents/skills/<name>/SKILL.md`; do not rely on description matching.

1. Branch from current `origin/<BASE>`.
2. Grill the plan before code (`grilling` skill). Architecture and engineering questions are answered first.
3. Edit loop: `<TEST>`.
4. Add a check for the behaviour in `.eng/checks/<id>.sh` and prove it: `eng verify create <id>` (fails on base, passes on HEAD, verdict pinned to the SHA as a git note).

## 2. What must pass before merge (on the exact head SHA)

`<GATE>` runs every required gate in `eng.config.yml` (`gates.required`). A skipped, missing or blocked gate is a failure.
After merging `<BASE>` in, the head is a new SHA: run `eng verify maintain` to re-verify on it.

## 3. Merge

- **Who merges:** <MERGE_OWNER> (set per repo in `eng.config.yml` → `merge`; there is no global rule).
- **Exact command:** `<MERGE_COMMAND>`.
- **Merge method:** <MERGE_METHOD>.
<SHIP>
## 4. Flags and database

- Flags file: `<FLAGS>`. New flags are added as `false`; `eng lint` rule `flags-default-off` enforces it.
- Migrations: `<MIGRATIONS>`. Additive only; `eng lint` rule `db-additive-only` rejects DROP / RENAME / destructive ALTER. Destructive change = expand/contract over two deploys.

## 5. GAPS

1. Server-side enforcement (rulesets, required checks) is not applied by `eng` v0. Local hooks are convenience; `--no-verify` skips them.
