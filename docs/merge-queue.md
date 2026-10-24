# eng-standard merge queue (v0.10.0)

Matt decided the rule on 24 Oct 2026 at 10:31 AM AEDT. Summary in [AGENTS.md](../AGENTS.md). It replaces the v0.8.0 self-merge (risk labels, a hold window, human merges for risk:high).

## Pieces

| Piece | Where | What it does |
|---|---|---|
| Config | `eng.config.yml` → `merge.queue` | The one config: required check, second-provider paths, post-merge check, stuck and verdict-wait minutes, restart webhook secret name |
| Required check | `.github/workflows/ci.yml`, job `test` | `npm ci`, `npm test`, then `eng merge gate` from main's code and main's config, on `pull_request` and `merge_group` |
| Gate | `eng merge gate` → `lib/merge-cli.mjs` → `lib/merge-queue.mjs` | On merge_group it computes the patch-id of the queued squash commit (`head^..head`) and its paths, then reads verdict comments and commit trailers from the PR. It passes when the latest independent verdict for that patch-id is a PASS, plus a second-provider PASS for gate, auth and billing paths. An `auto-revert` PR passes when it is the exact inverse of the commit it names |
| Verdict | `eng verdict PASS\|PASS+NOTES\|FAIL ... --pr <n>` | A git note, a PR comment (`<!-- eng-verdict/v1 -->` + JSON with the patch-id), the `verdict` commit status, then a re-run of the required check on that head |
| Post-merge | `.github/workflows/merge-post.yml` → `eng merge post` | `scripts/shipped-artifact-check.sh` on main. On failure it opens `auto-revert/<sha>`, labels it, turns on auto-merge and dispatches `ci.yml` on it (a PR opened with `GITHUB_TOKEN` starts no workflows). It never reverts a revert; it escalates instead |
| Watch | `.github/workflows/merge-watch.yml` → `eng merge watch` | Every 10 min: labels a PR `stuck` when its required check is red or missing with no activity for `stuck_minutes`. Restarts the owner on a FAIL, or when no verdict arrived `verdict_wait_minutes` after the head was pushed, once per cause |

## Patch-id binding

`eng verdict` binds `git diff merge-base(main, HEAD)..HEAD | git patch-id --stable`. The queue builds each entry as one squash commit on top of main, so `git diff head^ head` on merge_group has the same patch-id, unless main changed lines next to the patch. In that case the patch-id changes and the PR needs a new verdict. The queue builds one PR per group (`max_entries_to_merge: 1`), so the bound patch is exactly the one that merges.

## GitHub settings (an admin applies them; `eng merge settings` prints them)

Blocker: GitHub rejects the `merge_queue` rule on user-owned repositories (HTTP 422, checked 24 Oct 2026 on the user-owned `Mattslayga/eng-sandbox`). `Mattslayga/eng-standard` is user-owned. The merge queue needs the repo in an organization: public org repos have it, and private org repos need Enterprise Cloud. Matt is an admin of `Slaytek-Systems`. Moving the repo there is Matt's decision.

After the repo is in an org:

1. `gh api -X PATCH repos/<org>/eng-standard -F allow_auto_merge=true -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F delete_branch_on_merge=true`
2. Replace ruleset `main: test + verdict` with the one `eng merge settings` prints: no bypass actors, squash only, required check `test` only (the gate reads the verdict itself), and a merge queue of one.
3. Repo secret `ENG_RESTART_WEBHOOK`: the URL that restarts an owning job. Without it, `eng merge watch` only comments.
4. `gh label create stuck` and `gh label create auto-revert`. `eng merge post` creates `auto-revert` if it is missing.

## This PR is the bootstrap

`origin/main` has no `eng merge gate` until this PR merges, so this PR's `test` job runs its own gate (the workflow says BOOTSTRAP). It still needs the old ruleset's `test` and `verdict` and is the last PR merged by hand under the v0.8.0 rule.
