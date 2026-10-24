# v0.10.0 merge rule: sandbox proofs (24 Oct 2026)

Live GitHub runs, 00:20 to 02:05 UTC on 24 Oct 2026 (11:20 AM to 1:05 PM AEDT). Two sandboxes prove the two modes. Neither contains client code.

**Stand-in verdicts.** Every verdict in these sandboxes came from the builder under stand-in verifier identities (`sandbox-verifier-openai`, family gpt; `sandbox-verifier-google`, family gemini). They exercise the gate's mechanics and are not independent reviews. eng-standard PR #20 gets its verdicts from real independent verifiers.

## Repo transfer (Matt approved option 2, item 2)

`Mattslayga/eng-standard` → `Slaytek-Systems/eng-standard`.

- A snapshot was taken before the transfer and compared with the state after it.
- All 21 tag refs are byte-identical.
- The release list (4 releases) is identical, and `releases/latest` is still `v0.9.0`, whose tag points at `f27da0c`.
- Ruleset `25373681`, open PRs #19 and #20, all 13 labels, and the Actions setting (enabled) carried over.
- The old URL redirects. Local `origin` was repointed.

## Queue mode: `Slaytek-Systems/eng-sandbox-queue` (org, public)

Created for this proof. It pins eng-standard `01ffce0`, and its config is `merge.auto.mode: queue`, check `eng-merge-gate`, `stuck_minutes: 2`, `verdict_wait_minutes: 2`.

| Step | Result |
|---|---|
| `merge_queue` ruleset rule | Accepted (ruleset `25763099`). The same rule gets HTTP 422 on user-owned repos |
| `eng doctor` | `queue (merge queue rule active)`, one required check, auto-merge allowed. Fails only `verifier_logins` (self-declared) |
| [PR 1](https://github.com/Slaytek-Systems/eng-sandbox-queue/pull/1), docs | No verdict: gate FAIL `no independent verdict for patch-id f47237e26703`. Verdict, re-run, PASS. Auto-merge put it in the queue. The `merge_group` run [40047106583](https://github.com/Slaytek-Systems/eng-sandbox-queue/actions/runs/40047106583) said `PASS for merge_group 1adc0251 (PR #1), bound to patch-id f47237e26703`, and it merged |
| [PR 2](https://github.com/Slaytek-Systems/eng-sandbox-queue/pull/2), `scripts/` (gate path) | An openai PASS alone was refused: `need PASSes from two providers`. With a google PASS added, the `merge_group` gate said `second-provider rule met: openai + google`, and it merged |
| [PR 3](https://github.com/Slaytek-Systems/eng-sandbox-queue/pull/3), ships `BREAK-SHIPPED-ARTIFACT` | Merged. Then the post-merge check failed, `eng merge post` pushed `auto-revert/6f13dfc47699` (the exact inverse), and GitHub refused the PR: `GitHub Actions is not permitted to create or approve pull requests (HTTP 403)`. The org policy forbids it |
| [PR 4](https://github.com/Slaytek-Systems/eng-sandbox-queue/pull/4), that branch opened by a person | With the `auto-revert` label, the gate said `opened by Mattslayga, not github-actions[bot]` (provenance holds). Without the label and with no verdict, a real `eng merge watch` added `stuck` and posted one `Restart owner ... no verdict 4 min after head`. After a verdict it merged, and main recovered (post-merge PASS on `ea197cf6`) |
| Found | GitHub turns auto-merge off after a failed required check. Fixed: watch re-arms it once the gate passes, and `hold` is the stop switch |

## Strict mode: `Mattslayga/eng-sandbox` (user-owned, private, no merge queue)

It pins eng-standard `f2e0519`, later `94b2212`. The ruleset is `25764508` (strict, `eng-merge-gate` only, squash, no bypass), and auto-merge is on.

| Step | Result |
|---|---|
| `eng doctor` | `strict; no merge queue (user-owned or private without Enterprise)`, strict active, one required check, auto-merge allowed |
| [PR 3](https://github.com/Mattslayga/eng-sandbox/pull/3), bootstrap | Merged under the old ruleset (renovation checks + verdict), with a normal squash pinned to the head. Its own gate correctly asked for a second provider, because the PR touches gate paths |
| [PR 4](https://github.com/Mattslayga/eng-sandbox/pull/4) A, adds `merge-post.yml` (gate path) | Gate `PASS ... bound to head 6d5ccb33 ... second-provider rule met: openai + google`. GitHub auto-merge merged it |
| [PR 5](https://github.com/Mattslayga/eng-sandbox/pull/5) B, docs, opened from the same main | After A merged it was `BEHIND`, and the gate said `head d1cf483e is behind main: update the branch`. `eng merge watch` updated it with a merge (`aae3de6`, two parents, no force push). The gate then said `no independent verdict for head aae3de62`, because the old head's PASS does not carry. After a new verdict, auto-merge merged it (`a549a80d`) |
| [PR 6](https://github.com/Mattslayga/eng-sandbox/pull/6) C, credential-looking file | Merged. The post-merge `eng renovate scan` failed. `github-actions[bot]` opened [PR 7](https://github.com/Mattslayga/eng-sandbox/pull/7) with auto-merge on, and the dispatched gate said `auto-revert of 7a57af3d by github-actions[bot]: the exact inverse of a shipped commit`. It was BLOCKED until its held `pull_request` run was approved (by the builder, over the API). Then it merged (`a25616f8`), but got no post-merge run |
| Found and fixed (`94b2212`) | `eng merge post` approves its own revert PR's held runs. `eng merge watch` dispatches `merge-post.yml` when main's tip has no run |
| [PR 9](https://github.com/Mattslayga/eng-sandbox/pull/9) F, credential-looking file, hands-off | Merged. The post-merge check failed. The bot opened [PR 10](https://github.com/Mattslayga/eng-sandbox/pull/10), printed `approved held run 40051955475 (ci)`, and auto-merge merged it (`9a9d37d7`). One `merge-watch` run, triggered by hand in place of its 10-minute schedule, printed `main 9a9d37d7 has no merge-post.yml run: dispatching it`, and that post-merge run passed. No person acted between the merge of F and the green post-merge check |

## Trusted gate (after round 2: the required check must not come from PR-controlled workflow code)

The round-2 openai finding showed that a PR could delete the gate step from its own `ci.yml`. `eng-merge-gate` is now a commit status, posted only by:
- the trusted `gate.yml` (pull_request_target, workflow_run, issue_comment and dispatch, always main's copy and main's code) on PR heads;
- `ci.yml`'s `queued-gate` job on queued commits, in queue mode.

No job carries the required name.

| Step (`Slaytek-Systems/eng-sandbox-queue`, eng-standard `b6cbe3a`, later `d72d767`) | Result |
|---|---|
| [PR 5](https://github.com/Slaytek-Systems/eng-sandbox-queue/pull/5) Q-A adds `gate.yml` | Merged through the queue under the previous gate |
| [PR 6](https://github.com/Slaytek-Systems/eng-sandbox-queue/pull/6) Q-B, first head | The trusted gate posted `FAIL: a check run named eng-merge-gate exists on this head`. The merge_group-only job named `eng-merge-gate` is *skipped* on PRs, and **GitHub counts a skipped required job as passing**, so that job was a real loophole. Fixed in `d72d767`: the job is `queued-gate`, and it posts the status |
| PR 6 Q-B, after the fix | The trusted gate said `eng-merge-gate=failure: no independent verdict for patch-id 997f86526d22`. Each verdict comment re-triggered `gate.yml` (issue_comment). With openai + google stand-in PASSes the status became `success`. Queued; `queued-gate` posted `eng-merge-gate=success` on the queued commit `79a7308e`; merged |
| [PR 7](https://github.com/Slaytek-Systems/eng-sandbox-queue/pull/7) Q-C, forgery experiment | A PR job named `eng-merge-gate` reported success. The trusted gate's status said `failure: ... only the trusted gate may report eng-merge-gate`, and GitHub reported **BLOCKED**. Closed unmerged |

**Strict sandbox, wedged.**
- The first trusted `gate.yml` merged into `Mattslayga/eng-sandbox` (PR 11) failed on every PR. It had `persist-credentials: false`, so a private repo could not fetch `pull/<n>/head` (exit 128), and it posted no status. Its job was also named `eng-merge-gate`. Both are fixed in `b6cbe3a`.
- That broken gate on `main` gates its own fix, so [PR 12](https://github.com/Mattslayga/eng-sandbox/pull/12) cannot pass. Recovery would need a ruleset change or a posted status, so I left it for Matt. `docs/merge-queue.md` has a "Break glass" section about this.

## Open for Matt

- **Org setting.** `Slaytek-Systems` forbids GitHub Actions from creating PRs. The auto-revert needs it ("Allow GitHub Actions to create and approve pull requests", org and repo level). `eng doctor` fails until it is on.
- **Verifier identity.** Every agent on the devbox posts to GitHub as one identity, so verdict identity is self-declared. Separate bot accounts or GitHub Apps per verifier provider, listed in `merge.auto.verifier_logins`, close that. `eng doctor` fails until they exist.
- **Strict sandbox recovery.** `Mattslayga/eng-sandbox` is wedged by the first `gate.yml` (above). It needs an owner-only ruleset reset, or deleting and recreating the sandbox.
- **eng-standard settings** (`eng merge settings` prints them): strict ruleset, one required check `test`, auto-merge, the PR-creation permission, labels `stuck`, `hold`, `auto-revert`, and the `ENG_RESTART_WEBHOOK` secret.
