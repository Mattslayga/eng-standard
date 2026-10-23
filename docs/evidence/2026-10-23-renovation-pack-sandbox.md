# Renovation pack proof on eng-sandbox (spec v1 §10)

Run: `bash docs/evidence/2026-10-23-renovation-pack-sandbox.sh /home/dev/.t3/projects/eng-sandbox` from this checkout, 2026-10-22 21:50 UTC (rerun after the round-4 verifier fixes). eng-sandbox has no git remote, so this is a local proof only; no remote PR proof was run there.

The secret-filename finding in step 4 is a labelled fixture commit on the proof branch: the sandbox has no natural pre-existing finding. The verdict in step 8 is recorded by the script under a stand-in verifier identity to exercise the receipt path; the eng-standard PR verdict comes from an independent verifier.

```text
eng-standard 0.9.0 at fb19930; sandbox /home/dev/.t3/projects/eng-sandbox ref exp/ticketstore-effect-vs-ts

== 0. shared checkout before
   mode 775; origin: 0 remote(s)

== 1. isolated launch (spec §7)
     worktree /tmp/eng-launch-eng-sandbox-xZpgOC/wt (mode 700) at exp/ticketstore-effect-vs-ts 31980427
     tmp      /tmp/eng-launch-eng-sandbox-xZpgOC/tmp (mode 700)
     shared checkout /home/dev/.t3/projects/eng-sandbox left at mode 775
   eng launch: ready. cd /tmp/eng-launch-eng-sandbox-xZpgOC/wt && export TMPDIR=/tmp/eng-launch-eng-sandbox-xZpgOC/tmp   (remove: eng launch down /tmp/eng-launch-eng-sandbox-xZpgOC)
   OK   launch dir, worktree and tmp are 0700
   OK   shared checkout still mode 775
   branch renovation-proof/20261022T215049Z

== 2. audit (spec §1): read-only outside renovation/
     wrote renovation/audit.json
     wrote renovation/audit.md
     missing  1 eng-config    no eng.config.yml
     missing  1 shipping-md   no SHIPPING.md
     missing  1 merge-policy  
     missing  1 pack-version  no renovation.version
     missing  2 baselines     no renovation/baselines/*.json
     missing  2 secret-scan   no secret-filename baseline
     missing  2 fallow        no fallow: section
     missing  3 ci-checks     no .github/workflows or .buildkite
     missing  3 toolchain     no packageManager, .bun-version, .node-version, .nvmrc or .tool-versions pin
     missing  4 gates-mode    no renovation.gates.mode
     missing  5 receipt       no ship.verifier
     missing  6 e2e           
     missing  7 launch        no launch:
     present  7 modes         checkout mode 700
   eng renovate audit: 1 present, 0 partial, 13 missing -> renovation/audit.md (read-only outside renovation/)
   OK   audit (exit 0)
   OK   audit wrote only renovation/
   eng: FAIL apply: step 2 baselines needs docs-config first (fixed order, one PR each)
   OK   apply refuses out of order (exit 1)

== 3. step 1 docs-config (spec §3)
   eng renovate apply 1. docs-config: SHIPPING.md, eng.config.yml with a renovation block, renovation/divergences.md, CODEOWNERS line for baselines
     wrote eng.config.yml (seeded from templates/eng.config.yml; review every DRAFT value)
     wrote .github/CODEOWNERS
     wrote eng.config.yml
     wrote SHIPPING.md
     wrote renovation/divergences.md
   eng renovate apply docs-config: done. Review the diff, commit it on renovation-proof/20261022T215049Z and open a normal PR; it goes through this repo's gates and verifier. The pack never merges.
   OK   apply docs-config (exit 0)
   eng renovate render --check: PASS (2 files match)
   OK   render --check right after apply (exit 0)

== 4. fixture: one pre-existing finding (mirrors devbox-ops #4 scripts/start-secret-service.sh)
     secret-filename: 1 new, 0 baselined, 0 fixed since the baseline
       NEW scripts/start-secret-service.sh filename looks like a credential
     lint: 0 new, 0 baselined, 0 fixed since the baseline
   eng: FAIL renovate scan: secret-filename scripts/start-secret-service.sh. Fix them, or the policy owner adds them with eng renovate baseline --reason "..."
   OK   scan before the baseline: the old finding is not yet reviewed (exit 1)

== 5. step 2 baselines (spec §2)
   eng renovate apply 2. baselines: Baselines for pre-existing findings (secret filenames, eng lint, fallow)
     wrote renovation/baselines/secret-filename.json
     + secret-filename scripts/start-secret-service.sh (intentional credential-recovery helper (proof fixture); owner @Mattslayga)
     baseline secret-filename: 1 entry (+1 -0); this edit needs review by @Mattslayga (CODEOWNERS)
     wrote renovation/baselines/lint.json
     baseline lint: 0 entries (+0 -0)
     fallow: no fallow: section, skipped
     wrote eng.config.yml
   eng renovate apply baselines: done. Review the diff, commit it on renovation-proof/20261022T215049Z and open a normal PR; it goes through this repo's gates and verifier. The pack never merges.
   OK   apply baselines (exit 0)
     secret-filename: 0 new, 1 baselined, 0 fixed since the baseline
     lint: 0 new, 0 baselined, 0 fixed since the baseline
     NOTICE baseline edited on this branch: renovation/baselines/lint.json, renovation/baselines/secret-filename.json; needs review by @Mattslayga (CODEOWNERS)
   eng renovate scan: PASS (enforce; new findings only)
   OK   gate passes on the old, baselined finding (exit 0)
     secret-filename: 1 new, 1 baselined, 0 fixed since the baseline
       NEW config/prod-credentials.json filename looks like a credential
     lint: 0 new, 0 baselined, 0 fixed since the baseline
     NOTICE baseline edited on this branch: renovation/baselines/lint.json, renovation/baselines/secret-filename.json; needs review by @Mattslayga (CODEOWNERS)
   eng: FAIL renovate scan: secret-filename config/prod-credentials.json. Fix them, or the policy owner adds them with eng renovate baseline --reason "..."
   OK   gate fails on a new finding (exit 1)

== 6. step 3 gates-warn + CI toolchain preflight (spec §4)
   eng renovate apply 3. gates-warn: Gates in warn mode: CI snippet (eng renovate wire) and toolchain preflight
     wrote eng.config.yml
     wrote renovation/wire/buildkite.yml
     Ruleset change for an admin to make by hand (eng prints it, never applies it):
       branch main: add required status checks eng-ci-preflight, eng-scan, eng-lint, eng-render
       strict_required_status_checks_policy: false (renovation.merge_policy.strict)
     wrote eng.config.yml
   eng renovate apply gates-warn: done. Review the diff, commit it on renovation-proof/20261022T215049Z and open a normal PR; it goes through this repo's gates and verifier. The pack never merges.
   OK   apply gates-warn (exit 0)
     bun: repo pins 1.4.4, image sandbox-ci-v6 on queue sandbox-linux-small (buildkite) has 1.2.19. An authorized CI-image operator builds or selects an image with these versions and repoints the queue; the pack does not build images
   eng renovate ci-preflight: needs-decision: ci-image-operator (image sandbox-ci-v6, queue sandbox-linux-small)
   OK   preflight: Bun 1.4.4 vs image 1.2.19 is needs-decision, not red (exit 3)

== 7. step 4 gates-enforce
   eng renovate apply 4. gates-enforce: Gates enforce: new findings fail, baselined ones pass
     wrote eng.config.yml
     wrote eng.config.yml
   eng renovate apply gates-enforce: done. Review the diff, commit it on renovation-proof/20261022T215049Z and open a normal PR; it goes through this repo's gates and verifier. The pack never merges.
   OK   apply gates-enforce (exit 0)

== 8. step 5 verifier + receipt (spec §5)
   eng renovate apply 5. verifier: Independent verifier and receipt adapter
     wrote eng.config.yml
     wrote .gitignore
     wrote eng.config.yml
   eng renovate apply verifier: done. Review the diff, commit it on renovation-proof/20261022T215049Z and open a normal PR; it goes through this repo's gates and verifier. The pack never merges.
   OK   apply verifier (exit 0)
   (verdict below is recorded by this script under a stand-in verifier identity to prove the receipt mechanics; the PR's real verdict comes from an independent verifier)
   eng verdict: recorded PASS by renovation-proof-verifier (gpt) on cae4d25f, patch-id 95c0eac9a957
   OK   verdict records provider (exit 0)
     patch-id 95c0eac9a957; code written by renovation-proof-builder, matt@slayteksystems.com (families: claude)
   eng verdict: PASS (PASS by renovation-proof-verifier (gpt) on cae4d25f)
   OK   verdict check accepts it (different family from the builder) (exit 0)
     verdict PASS by renovation-proof-verifier (gpt, openai) on cae4d25f
   eng renovate receipt: DRAFT core-edge.ship-receipt/v1 for PR #1 head cae4d25f -> renovation/receipts/cae4d25fc0686511606636f69736c4548e9c7764.md. Not posted: the lead or its lane posts it as a COMMENT review on this exact head.
   OK   receipt draft (exit 0)
   OK   receipt binds head, base tip, head tree and providers
     verdict PASS on this head
     1. eng renovate receipt --pr <n>   (core-edge.ship-receipt/v1 binds head, base and diff, so every new head needs a new receipt draft; the lead or its lane posts it)
   eng renovate refresh: receipt
   OK   refresh: verdict current, receipt is a draft for this head (exit 0)

== 9. step 6 e2e / native proof ledger (spec §6)
   eng renovate apply 6. e2e: e2e / native proof ledger gates with timeouts
     wrote eng.config.yml
     e2e flows: author them with the e2e-flow skill from templates/e2e; eng renovate prove records each gate in renovation/proof/<sha>.json
     wrote eng.config.yml
     wrote SHIPPING.md
   eng renovate apply e2e: done. Review the diff, commit it on renovation-proof/20261022T215049Z and open a normal PR; it goes through this repo's gates and verifier. The pack never merges.
   OK   apply e2e (exit 0)
     pass     test       1863ms
     blocked(timeout) heavy      1007ms
   eng renovate prove: NOT PROVED (blocked) on fb5a7f13 -> renovation/proof/fb5a7f13db4877d972b98fd2b16b015894f88d6d.json; re-run to resume (passed gates are kept), --force to redo all
   OK   prove: heavy gate times out, recorded blocked, NOT PROVED (exit 3)
     pass     test       (resumed from renovation/proof/fb5a7f13db4877d972b98fd2b16b015894f88d6d.json)
     pass     heavy      3011ms
   eng renovate prove: PROVED on fb5a7f13 -> renovation/proof/fb5a7f13db4877d972b98fd2b16b015894f88d6d.json
   OK   prove resumes: test kept, heavy re-run with a longer timeout (exit 0)
   eng: FAIL prove: working tree not clean; commit first so the ledger proves a real SHA
   OK   prove refuses an uncommitted gate edit (the ledger binds a commit) (exit 1)
   OK   ledger is proved for this sha

== 10. step 7 launch contract
   eng renovate apply 7. launch: Isolated launch contract: private 0700 worktree and tmp
     wrote eng.config.yml
     wrote eng.config.yml
   eng renovate apply launch: done. Review the diff, commit it on renovation-proof/20261022T215049Z and open a normal PR; it goes through this repo's gates and verifier. The pack never merges.
   OK   apply launch (exit 0)

== 11. drift-check (spec §7)
   eng renovate render --check: PASS (2 files match)
   OK   render --check passes (exit 0)
   eng: FAIL renovate render --check:
     SHIPPING.md: differs from what eng.config.yml and the templates render
     Fix: eng renovate render (local rules between the renovation:local markers are kept)
   OK   render --check fails on a hand edit (exit 1)
   eng renovate render --check: PASS (2 files match)
   OK   render --check passes again (exit 0)

== 12. final audit and plan
     wrote renovation/audit.json
     wrote renovation/audit.md
     present  1 eng-config    eng.config.yml
     present  1 shipping-md   SHIPPING.md matches eng renovate render
     present  1 merge-policy  renovation.merge_policy: strict false, verdict_carry patch-id
     present  1 pack-version  pack 0.9.0
     present  2 baselines     renovation/baselines/secret-filename.json
     present  2 secret-scan   renovation/baselines/secret-filename.json
     missing  2 fallow        no fallow: section
     missing  3 ci-checks     no .github/workflows or .buildkite
     partial  3 toolchain     bun: repo pins 1.4.4, image sandbox-ci-v6 on queue sandbox-linux-small (buildkite) has 1.2.19. An authorized CI-image operator builds or selects an image with these versions and repoints the queue; the pack does not build images
     present  4 gates-mode    renovation.gates.mode enforce
     present  5 receipt       ship.verifier: fresh-context agent
     partial  6 e2e           
     partial  7 launch        launch: worktree private, mode 0700 (no up/doctor/down yet)
     present  7 modes         checkout mode 700
   eng renovate audit: 9 present, 3 partial, 2 missing -> renovation/audit.md (read-only outside renovation/)
   OK   audit (exit 0)
     done 1. docs-config   SHIPPING.md, eng.config.yml with a renovation block, renovation/divergences.md, CODEOWNERS line for baselines
     done 2. baselines     Baselines for pre-existing findings (secret filenames, eng lint, fallow)
     done 3. gates-warn    Gates in warn mode: CI snippet (eng renovate wire) and toolchain preflight
     done 4. gates-enforce Gates enforce: new findings fail, baselined ones pass
     done 5. verifier      Independent verifier and receipt adapter
     done 6. e2e           e2e / native proof ledger gates with timeouts
     done 7. launch        Isolated launch contract: private 0700 worktree and tmp
   eng renovate plan: all steps done
   OK   plan (exit 0)

== 13. cleanup
   eng launch down: removed /tmp/eng-launch-eng-sandbox-xZpgOC/wt and /tmp/eng-launch-eng-sandbox-xZpgOC
   OK   launch down (no --force) (exit 0)
   OK   shared checkout still mode 775
   proof branch kept in the sandbox repo: renovation-proof/20261022T215049Z

RESULT: PASS (0 failed check(s))
```
