# v0.9.1 scratch and disk hygiene proof on eng-sandbox

Run: `bash docs/evidence/2026-10-24-scratch-hygiene-sandbox.sh /home/dev/.t3/projects/eng-sandbox` from this checkout, 2026-10-23 23:15 UTC. Real cargo 1.93.1, deno 2.9.1, rootless docker 29.7.1 (postgres:17-alpine, which declares a VOLUME, so each container gets an anonymous volume).

The Warden cases (motus mkdtemp in /tmp, Core Edge Rust targets in /tmp, equitus Deno caches per run, Docker anonymous volumes) are planted as files inside an eng launch round at sandbox `origin/main` and vanish with it; the shared checkout is never edited. The credential check counts files containing the gh token without printing it. Indented `FAIL` lines are doctor output during the two expected-failure runs.

```text
eng-standard 0.9.1 at f27da0c; sandbox /home/dev/.t3/projects/eng-sandbox

== 1. doctor + Warden cases inside one round at origin/main
     round /home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll8yj4-2090675-launch-Bxrgqm (mode 700, removed on exit)
     worktree /home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll8yj4-2090675-launch-Bxrgqm/wt at origin/main 7552a991; TMPDIR=/home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll8yj4-2090675-launch-Bxrgqm/tmp; shared checkout /home/dev/.t3/projects/eng-sandbox left at mode 775
      round ENG_SCRATCH=/home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll8yj4-2090675-launch-Bxrgqm (mode 700), cwd /home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll8yj4-2090675-launch-Bxrgqm/wt
        FAIL hygiene.scratch_root is set and not under /tmp  (fix: scratch_root: "${XDG_CACHE_HOME}/eng/${repo}/scratch")
        ok   hygiene.disk_lint is on (built-in disk rules run in eng lint)
        FAIL hygiene.evidence is per_pr (evidence/<pr-n>/, cleared on merge or close)  (fix: evidence: per_pr)
      eng: FAIL doctor: 2 disk-hygiene problem(s) above
      OK   doctor fails the sandbox's 0.9.0 config (no scratch_root, no per-PR evidence) (exit 1)
        FAIL hygiene.scratch_root is set and not under /tmp  (fix: scratch_root: "${XDG_CACHE_HOME}/eng/${repo}/scratch")
        ok   hygiene.disk_lint is on (built-in disk rules run in eng lint)
        FAIL hygiene.evidence is per_pr (evidence/<pr-n>/, cleared on merge or close)  (fix: evidence: per_pr)
        FAIL hygiene.caches.cargo_target is one shared per-repo cache (CARGO_TARGET_DIR)  (fix: caches: { cargo_target: "${XDG_CACHE_HOME}/eng/${repo}/cargo-target" })
        FAIL hygiene.caches.deno is one shared per-repo cache (DENO_DIR)  (fix: caches: { deno: "${XDG_CACHE_HOME}/eng/${repo}/deno" })
        FAIL hygiene.containers.label is set (containers run --rm or carry the label; eng clean --containers removes them with volumes)  (fix: containers: { label: eng.repo })
        FAIL scripts/deno-check.sh:2: [script-bare-tmpdir] Script writes scratch to bare /tmp (or os.tmpdir()/mktemp outside a round). Use $ENG_SCRATCH / $ENG_TMP from eng launch -- <cmd> or eng verdict round -- <cmd> (removed on exit), e.g. fs.mkdtempSync(path.join(process.env.ENG_TMP, "x-")) or mktemp -d -p "$ENG_TMP".
        FAIL scripts/proof-e2e.mjs:2: [script-bare-tmpdir] Script writes scratch to bare /tmp (or os.tmpdir()/mktemp outside a round). Use $ENG_SCRATCH / $ENG_TMP from eng launch -- <cmd> or eng verdict round -- <cmd> (removed on exit), e.g. fs.mkdtempSync(path.join(process.env.ENG_TMP, "x-")) or mktemp -d -p "$ENG_TMP".
        FAIL scripts/rust-build.sh:2: [script-bare-tmpdir] Script writes scratch to bare /tmp (or os.tmpdir()/mktemp outside a round). Use $ENG_SCRATCH / $ENG_TMP from eng launch -- <cmd> or eng verdict round -- <cmd> (removed on exit), e.g. fs.mkdtempSync(path.join(process.env.ENG_TMP, "x-")) or mktemp -d -p "$ENG_TMP".
        FAIL scripts/rust-build.sh:2: [cargo-target-tmp] Cargo target in a temp dir: every run rebuilds and leaves GBs behind. Use the one shared per-repo target eng exports as CARGO_TARGET_DIR (hygiene.caches.cargo_target).
        FAIL scripts/deno-check.sh:2: [deno-dir-unstable] DENO_DIR in a temp dir: a new Deno cache per run. Use the stable DENO_DIR eng exports (hygiene.caches.deno).
        FAIL scripts/db.sh:2: [container-no-rm] Container without --rm or the eng label leaves it and its anonymous volumes behind. Add --rm, or --label "$ENG_CONTAINER_LABEL" and clean up with eng clean --containers --apply (removes containers with their volumes).
        FAIL scripts/reset.sh:2: [volume-prune-all] docker volume prune -a deletes every unused volume on the box, including other repos' data. Remove only this repo's labelled volumes: eng clean --containers --apply.
        FAIL scripts/login.sh:2: [credential-to-disk] Credential written to disk. Keep it in env (injected per run) or pass it on stdin (--password-stdin); never redirect a token to a file or put a literal _authToken in .npmrc.
      eng: FAIL doctor: 13 disk-hygiene problem(s) above
      OK   doctor fails on the planted Warden cases (exit 1)
      OK   doctor names script-bare-tmpdir
      OK   doctor names cargo-target-tmp
      OK   doctor names deno-dir-unstable
      OK   doctor names container-no-rm
      OK   doctor names volume-prune-all
      OK   doctor names credential-to-disk
      OK   doctor names caches.cargo_target
      OK   doctor names caches.deno
      OK   doctor names containers.label
        ok   hygiene.scratch_root is set and not under /tmp
        ok   hygiene.disk_lint is on (built-in disk rules run in eng lint)
        ok   hygiene.evidence is per_pr (evidence/<pr-n>/, cleared on merge or close)
        ok   hygiene.caches.cargo_target is one shared per-repo cache (CARGO_TARGET_DIR)
        ok   hygiene.caches.deno is one shared per-repo cache (DENO_DIR)
        ok   hygiene.containers.label is set (containers run --rm or carry the label; eng clean --containers removes them with volumes)
      eng doctor: PASS (6 config checks, 7 disk rules)
      OK   doctor passes after the fixes (exit 0)
      /home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll8yj4-2090675-launch-Bxrgqm/tmp/proof-e2e-7bJv3B
      OK   motus case: proof script writes under the round (exit 0)
      OK   it is inside ENG_SCRATCH
      /home/dev/.cache/eng/eng-sandbox/cargo-target/debug/hello
      OK   Core Edge case: cargo builds into the shared target (exit 0)
      /home/dev/.cache/eng/eng-sandbox/deno
      OK   equitus case: deno uses the stable DENO_DIR (exit 0)
      OK   labelled postgres started
   eng launch: command exited 0; removing round eng-eng-sandbox-mvll8yj4-2090675-launch-Bxrgqm
   OK   round 1 (exit 0)
   OK   round dirs under /home/dev/.cache/eng/eng-sandbox/scratch all removed
   OK   no credential in the scratch root or caches

== 2. a failing round is removed too
     round /home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll8ztg-2091973-launch-pG7gSz (mode 700, removed on exit)
     worktree /home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll8ztg-2091973-launch-pG7gSz/wt at origin/main 7552a991; TMPDIR=/home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll8ztg-2091973-launch-pG7gSz/tmp; shared checkout /home/dev/.t3/projects/eng-sandbox left at mode 775
   eng launch: command exited 7; removing round eng-eng-sandbox-mvll8ztg-2091973-launch-pG7gSz
   OK   round exits 7 (exit 7)
   OK   failing round removed
     round /home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll8zvh-2092000-verdict-6phwtK (mode 700, removed on exit)
     worktree /home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll8zvh-2092000-verdict-6phwtK/wt at origin/main 7552a991; TMPDIR=/home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll8zvh-2092000-verdict-6phwtK/tmp; shared checkout /home/dev/.t3/projects/eng-sandbox left at mode 775
   eng verdict round: command exited 0; removing round eng-eng-sandbox-mvll8zvh-2092000-verdict-6phwtK
   OK   verdict round (exit 0)
   OK   verdict round removed

== 3. shared caches survive rounds
     round /home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll8zxl-2092022-launch-vDsRVY (mode 700, removed on exit)
     worktree /home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll8zxl-2092022-launch-vDsRVY/wt at origin/main 7552a991; TMPDIR=/home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll8zxl-2092022-launch-vDsRVY/tmp; shared checkout /home/dev/.t3/projects/eng-sandbox left at mode 775
      OK   round 2 sees round 1's Cargo build in the shared target
      OK   round 2 sees the populated DENO_DIR
   eng launch: command exited 0; removing round eng-eng-sandbox-mvll8zxl-2092022-launch-vDsRVY
   OK   round 2 (caches) (exit 0)
   OK   same CARGO_TARGET_DIR and DENO_DIR in both rounds
   caches: /home/dev/.cache/eng/eng-sandbox/cargo-target|/home/dev/.cache/eng/eng-sandbox/deno

== 4. containers: labelled postgres removed with its anonymous volume
   container ac22f40f0cca, anonymous volume f9a4655592b4
   OK   container carries eng.repo=eng-sandbox
     round /home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll900l-2092078-launch-D6LwYW (mode 700, removed on exit)
     worktree /home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll900l-2092078-launch-D6LwYW/wt at origin/main 7552a991; TMPDIR=/home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll900l-2092078-launch-D6LwYW/tmp; shared checkout /home/dev/.t3/projects/eng-sandbox left at mode 775
        would remove container ac22f40f0cca practical_cannon Up Less than a second (with its anonymous volumes)
      eng clean --containers: 1 container(s), 0 volume(s) labelled eng.repo=eng-sandbox (dry run; --apply to remove)
      OK   clean --containers dry run lists the labelled container (exit 0)
        removed container ac22f40f0cca practical_cannon Up Less than a second (with its anonymous volumes)
      eng clean --containers: 1 container(s), 0 volume(s) labelled eng.repo=eng-sandbox removed
      OK   clean --containers --apply (exit 0)
   eng launch: command exited 0; removing round eng-eng-sandbox-mvll900l-2092078-launch-D6LwYW
   OK   cleanup round (exit 0)
   OK   container gone
   OK   its anonymous volume gone

== 5. evidence per PR, cleared on merge or close
     round /home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll90gs-2092541-launch-Jygi4a (mode 700, removed on exit)
     worktree /home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll90gs-2092541-launch-Jygi4a/wt at origin/main 7552a991; TMPDIR=/home/dev/.cache/eng/eng-sandbox/scratch/eng-eng-sandbox-mvll90gs-2092541-launch-Jygi4a/tmp; shared checkout /home/dev/.t3/projects/eng-sandbox left at mode 775
        keep   .eng/evidence/7552a991beab3ed9d5cc3b46968073f2ee359062 (legacy per-SHA dir (not per PR): move or delete by hand)
        would remove .eng/evidence/pr-1 (PR #1 merged)
        would remove .eng/evidence/pr-2 (PR #2 merged)
        keep   .eng/evidence/pr-999999 (PR #999999 state unknown)
      eng clean --evidence: 2 merged/closed PR evidence dir(s) (dry run; --apply to delete), 2 kept
      OK   clean --evidence dry run (exit 0)
      OK   dry run removed nothing
        keep   .eng/evidence/7552a991beab3ed9d5cc3b46968073f2ee359062 (legacy per-SHA dir (not per PR): move or delete by hand)
        removed .eng/evidence/pr-1 (PR #1 merged)
        removed .eng/evidence/pr-2 (PR #2 merged)
        keep   .eng/evidence/pr-999999 (PR #999999 state unknown)
      eng clean --evidence: 2 merged/closed PR evidence dir(s) removed, 2 kept
      OK   clean --evidence --apply (exit 0)
      OK   merged PRs #1 and #2 cleared; unknown PR and legacy dir kept
   eng launch: command exited 0; removing round eng-eng-sandbox-mvll90gs-2092541-launch-Jygi4a
   OK   evidence round (exit 0)

== 6. nothing in bare /tmp, shared checkout untouched
   OK   no new eng-sandbox entries in /tmp (0)
   OK   shared checkout mode 775 and status unchanged
   OK   no leftover round worktrees in git

RESULT: PASS (0 failed check(s))
```
