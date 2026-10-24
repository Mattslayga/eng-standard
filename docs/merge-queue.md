# eng-standard merge rule (v0.10.0)

Matt decided the rule on 24 Oct 2026 at 10:31 AM AEDT, then option 2 at 11:22 AM AEDT. Summary in [AGENTS.md](../AGENTS.md). It replaces the v0.8.0 self-merge (risk labels, a hold window, human merges for risk:high).

## Modes

| | `strict` (default) | `queue` (optional speed-up) |
|---|---|---|
| Where | any repo | org-owned public repos, or private on Enterprise Cloud (user-owned repos get HTTP 422) |
| Branch protection | required check `test`, strict (up to date with main), squash only, no bypass | required check `test`, merge queue of one, squash only, no bypass |
| Verdict binds | the exact PR head commit | the patch-id of the queued merge_group commit (`head^..head`) |
| After main moves | `eng merge watch` updates the branch (auto-merge on), then the new head needs a new verdict | the queue rebuilds; the verdict carries while the patch-id is unchanged |
| Who merges | GitHub auto-merge | the merge queue |

`eng doctor` reads the live repo (owner type, visibility, rulesets, auto-merge) and fails if the declared `merge.auto.mode` is not the one the repo runs. `eng merge settings` prints the ruleset for the declared mode and never applies it.

## Pieces

| Piece | Where | What it does |
|---|---|---|
| Config | `eng.config.yml` → `merge.auto` | Mode, the one required check, second-provider paths, post-merge check, stuck and verdict-wait minutes, restart webhook secret, verifier logins |
| Required check | `.github/workflows/ci.yml`, job `test` | `npm ci`, `npm test`, then `eng merge gate` from main's code and main's config, on `pull_request`, `merge_group` and `workflow_dispatch` (input `pr`) |
| Gate | `eng merge gate` → `lib/merge-cli.mjs` → `lib/merge-queue.mjs` | Passes when the latest independent verdict for the bound head or patch-id is a PASS. Gate, auth and billing paths also need PASSes from two providers other than the authors'. An `auto-revert` PR passes only when all hold: opened by `github-actions[bot]`, on `auto-revert/<sha12>`, its target is on main, and it is the exact inverse |
| Verdict | `eng verdict PASS\|PASS+NOTES\|FAIL ... --pr <n>` | A git note, a PR comment (`<!-- eng-verdict/v1 -->` + JSON), the `verdict` commit status, then a re-run of the required check on that head |
| Verifier identity | `merge.auto.verifier_logins` | When set, only comments written by a listed GitHub login count, and their provider is the login's. When unset, the claims are self-declared, because every agent on the devbox posts as one GitHub identity. `eng doctor` fails the check until it is set |
| Post-merge | `merge-post.yml` → `eng merge post` | `scripts/shipped-artifact-check.sh` on main. On failure it opens `auto-revert/<sha12>`, labels it, turns on auto-merge and dispatches `ci.yml` with `pr`. It never reverts a revert; it escalates instead |
| Watch | `merge-watch.yml` → `eng merge watch` | Every 10 min: `stuck` label; owner restart; update-branch for a behind auto-merge PR in strict mode; re-arms auto-merge once the gate passes (GitHub turns it off after a failed check); disarms it on the `hold` label |

## GitHub settings (an admin applies them; `eng merge settings` prints them)

`Slaytek-Systems/eng-standard` (moved from `Mattslayga/eng-standard` on 24 Oct 2026; GitHub redirects the old URL) is an org-owned public repo, so both modes are available. It runs `strict`.

1. `gh api -X PATCH repos/Slaytek-Systems/eng-standard -F allow_auto_merge=true -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F delete_branch_on_merge=true`
2. Replace ruleset `main: test + verdict` with the one `eng merge settings` prints: strict, required check `test` only (the gate reads the verdict itself), squash only, no bypass actors.
3. Allow GitHub Actions to create pull requests (repo Actions settings; the `Slaytek-Systems` org currently forbids it, HTTP 409/403). Without it the auto-revert branch is pushed but its PR is refused, and `eng merge post` says so. `eng doctor` checks this.
4. Repo secret `ENG_RESTART_WEBHOOK`: the URL that restarts an owning job. Without it, `eng merge watch` only comments.
5. Give each verifier provider its own GitHub identity (a bot account or GitHub App), and list it in `merge.auto.verifier_logins`.

## Break glass (Matt's call)

`gate.yml` runs from `main`, so a broken gate on `main` also gates the PR that fixes it. In the strict sandbox, a `gate.yml` that could not fetch a private repo's PR head left every PR without the required status, its own fix included. Keep `gate.yml` small and tested. A repo needs a written, owner-only recovery step for a broken gate (for example, the owner swaps the required check to the previous gate for one fix PR, and the swap is logged). Matt decides that step; eng never edits rulesets.

## This PR is the bootstrap

`origin/main` has no `eng merge gate` until this PR merges, so this PR's `test` job runs its own gate (the workflow says BOOTSTRAP). It needs the old ruleset's `test` and `verdict`, and it is the last PR merged by hand under the v0.8.0 rule.

## Proof

- Unit and CLI tests: `test/merge-queue.test.mjs`.
- Strict mode end to end on `Mattslayga/eng-sandbox` (user-owned, private) and queue mode end to end on `Slaytek-Systems/eng-sandbox-queue` (org, public): `docs/evidence/2026-10-24-merge-rule-sandboxes.md`.
