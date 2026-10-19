# eng-standard self-merge (v0.8.0)

Design A from the 19 Oct 2026 merge discussion, applied to eng-standard itself. Rule summary: [AGENTS.md](../AGENTS.md).

## Pieces

| Piece | Where | What it does |
|---|---|---|
| Merge rule | `eng.config.yml` (`merge`, `ship`), `AGENTS.md` | risk:low merges itself, risk:high waits for Matt, nobody bypasses |
| Risk label | `.github/workflows/risk-label.yml` → `scripts/pr-gate.mjs label` → `lib/risk.mjs` | On PR open, push, reopen, ready and edit (incl. retarget to main): `risk:high` if any changed path (or a rename's old path) matches `ship.high_risk.paths`, else `risk:low`. `package.json` / `package-lock.json` count only when more than the version changed. Runs main's code (`pull_request_target`, no PR checkout) so a PR cannot relabel itself |
| Verdict status | `eng verdict ... --pr <n>` / `eng verdict status --pr <n>` (`bin/eng.mjs`) | Posts commit status `verdict` (success/failure) on the PR's exact head SHA from `eng verdict check` |
| Self-merge | `.github/workflows/self-merge.yml` → `scripts/pr-gate.mjs merge` → `lib/self-merge.mjs` | Every 30 min and on dispatch. Skips everything if main's `test` is red or running (no run yet: dispatches `ci.yml`). Then squash-merges the oldest eligible PR with `sha=<head>`, deletes its branch, dispatches `ci.yml` on main |
| Undo | `gh pr revert <n>` | Opens a revert PR |

Self-merge merges a PR only when **all** hold: base `main`; branch in this repo (no forks); not draft; label `risk:low`;
no `hold` or `risk:high` label; risk recomputed from the files is low (the label alone is not trusted); latest `test`
check run (GitHub Actions) is success on the head SHA; `verdict` status is success on the head SHA; and the later of
those two went green at least `hold_minutes` ago. A new push gives a new head SHA, so both must go green again and the
window restarts. `hold` is checked again just before the merge call. Dispatch inputs cannot shorten the window.

## The checker's command

Run by a fresh T3 thread that Eng Manager launches. It must not have written any commit in the PR, and its model family
must differ from every `Agent-Family:` trailer in the PR's commits (authors so far are `grok`).

```sh
# inputs: <n> PR number, <id> the checker's agent id (e.g. its T3 thread id), <family> its model family,
#         <evidence> Core note id (or path) with what it checked
git fetch origin main && gh pr checkout <n> && git pull --ff-only
npm ci && npm test                      # plus the review its brief asks for
node bin/eng.mjs verdict PASS --by <id> --family <family> --evidence <evidence> --pr <n>     # or FAIL
```

`--pr` records the verdict (git note bound to the patch-id) and then posts
`gh api repos/{owner}/{repo}/statuses/<head-sha> -f state=success|failure -f context=verdict`. It refuses to run when
local HEAD is not the PR's live head or the tree is dirty, and posts `failure` when the only verdicts are by an author
or an author's family, or the latest independent verdict is FAIL. After a push that keeps the patch-id (a clean rebase),
`node bin/eng.mjs verdict status --pr <n>` re-posts without a new review; a changed patch needs a new verdict.
Running the PR's own `bin/eng.mjs` is safe for risk:low PRs because `bin/**` is risk:high.

## Undo

`gh pr revert <n>` opens a PR that reverts the squash commit. It is classed like the original (a low PR's revert is low)
and needs `test` plus a `verdict` like any PR. Once both are green Matt can merge it by hand at once instead of waiting
for the window.

## GitHub settings (apply only after this PR merges)

Matt (admin) runs these once. A user-owned public repo supports repository rulesets on the free plan; `bypass_actors`
can be empty (OrganizationAdmin does not apply to personal repos), so the rules bind Matt too. Matt can still edit or
delete the ruleset as the repo admin; that is the only way around it. Merge queue is not available (user-owned repo).

```sh
R=Mattslayga/eng-standard

# 1. Labels the workflows use (risk:high already exists)
gh label create risk:low --repo $R --color 0E8A16 --description "Self-merges after test + verdict + hold window"
gh label create hold     --repo $R --color FBCA04 --description "Stops self-merge for this PR"

# 2. Merge settings: squash only, delete head branches (GitHub then retargets stacked PRs to main)
gh api -X PATCH repos/$R -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F delete_branch_on_merge=true

# 3. Ruleset on main: PRs only, squash only, require test (GitHub Actions app 15368) + verdict, no deletion, no force-push, no bypass
gh api -X POST repos/$R/rulesets --input - <<'JSON'
{
  "name": "main: test + verdict, squash only, no bypass",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "allowed_merge_methods": ["squash"],
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [ { "context": "test", "integration_id": 15368 }, { "context": "verdict" } ] } }
  ]
}
JSON

# 4. Check
gh api repos/$R/rules/branches/main -q '.[].type'
gh workflow run self-merge.yml --repo $R -f dry_run=true     # first run: report only
```

## Known limits

- Every agent and Matt share the `Mattslayga` identity, so GitHub cannot tell who posted `verdict`. Independence rests
  on the checker command and the commit trailers. A separate agent identity (GitHub App) would let the ruleset pin
  `verdict` to that app, as it pins `test` to GitHub Actions.
- Commits without `Agent-Family:` trailers leave `eng verdict check` nothing to compare families against.
- The labeller and self-merge only run from `main`, so they first act after this PR merges.
