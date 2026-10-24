#!/usr/bin/env bash
# v0.9.1 scratch and disk hygiene proof on eng-sandbox only. Warden's cases: motus mkdtemp in /tmp, Core Edge Rust targets in
# /tmp, equitus Deno caches per run, Docker anonymous volumes. Every repo change happens inside eng launch rounds (removed on exit);
# the shared checkout is never edited. Leaves behind: the shared caches under ~/.cache/eng/eng-sandbox/ (the point of the test).
set -uo pipefail
if [ "${1:-}" = --inner ]; then shift; step=$1; shift; fi
SANDBOX=$(cd "${SANDBOX:-${1:?usage: $0 <path to eng-sandbox>}}" && pwd)
[ "$(basename "$SANDBOX")" = eng-sandbox ] || { echo "refusing: this proof runs on eng-sandbox only, not $SANDBOX"; exit 2; }
PKG=$(cd "$(dirname "$0")/../.." && pwd); SELF="$PKG/docs/evidence/$(basename "$0")"
eng() { node "$PKG/bin/eng.mjs" "$@"; }
fails=0
expect() { local want=$1 desc=$2; shift 2; local out; out=$("$@" 2>&1); local got=$?; printf '%s\n' "$out" | sed 's/^/   /'
  if [ "$got" = "$want" ]; then echo "   OK   $desc (exit $got)"; else echo "   FAIL $desc (exit $got, want $want)"; fails=$((fails + 1)); fi; }
check() { if eval "$2"; then echo "   OK   $1"; else echo "   FAIL $1"; fails=$((fails + 1)); fi; }
cfgset() { node -e "const fs=require('fs'),Y=require('$PKG/node_modules/yaml');const d=Y.parseDocument(fs.readFileSync('eng.config.yml','utf8'));d.setIn($1,d.createNode($2));fs.writeFileSync('eng.config.yml',String(d))"; }
finish() { [ "$fails" = 0 ]; exit $?; }

# ---------- inner steps: run by `eng launch -- bash $SELF --inner <step>` inside a round worktree ----------
if [ -n "${step:-}" ]; then
  case $step in
  doctor)
    echo "   round ENG_SCRATCH=$ENG_SCRATCH (mode $(stat -c %a "$ENG_SCRATCH")), cwd $(pwd)"
    expect 1 "doctor fails the sandbox's 0.9.0 config (no scratch_root, no per-PR evidence)" eng doctor
    mkdir -p scripts src
    printf "import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';\nconst dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-e2e-'));\nconsole.log(dir);\n" > scripts/proof-e2e.mjs
    printf '[package]\nname = "hello"\nversion = "0.1.0"\nedition = "2021"\n' > Cargo.toml; printf 'fn main() { println!("hello"); }\n' > src/main.rs
    printf '#!/bin/sh\nCARGO_TARGET_DIR=/tmp/core-edge-target-$$ cargo build -q\n' > scripts/rust-build.sh
    printf '{ "tasks": {} }\n' > deno.json; printf '#!/bin/sh\nDENO_DIR=$(mktemp -d) deno eval "console.log(1)"\n' > scripts/deno-check.sh
    printf '#!/bin/sh\ndocker run -d -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine\n' > scripts/db.sh
    printf '#!/bin/sh\ndocker volume prune -a -f\n' > scripts/reset.sh
    printf '#!/bin/sh\ngh auth token > .gh-token\n' > scripts/login.sh
    expect 1 "doctor fails on the planted Warden cases" eng doctor
    out=$(eng doctor 2>&1)
    for id in script-bare-tmpdir cargo-target-tmp deno-dir-unstable container-no-rm volume-prune-all credential-to-disk 'caches.cargo_target' 'caches.deno' 'containers.label'; do
      check "doctor names $id" 'grep -q -- "$id" <<<"$out"'; done
    cfgset "['hygiene','scratch_root']" "'\${XDG_CACHE_HOME}/eng/\${repo}/scratch'"; cfgset "['hygiene','evidence']" "'per_pr'"
    cfgset "['hygiene','caches']" "{cargo_target:'\${XDG_CACHE_HOME}/eng/\${repo}/cargo-target',deno:'\${XDG_CACHE_HOME}/eng/\${repo}/deno'}"
    cfgset "['hygiene','containers']" "{label:'eng.repo'}"
    printf "import fs from 'node:fs'; import path from 'node:path';\nconst dir = fs.mkdtempSync(path.join(process.env.ENG_TMP, 'proof-e2e-'));\nconsole.log(dir);\n" > scripts/proof-e2e.mjs
    printf '#!/bin/sh\ncargo build -q && ls "$CARGO_TARGET_DIR/debug/hello"\n' > scripts/rust-build.sh
    printf '#!/bin/sh\ndeno eval "console.log(1)" >/dev/null && echo "$DENO_DIR"\n' > scripts/deno-check.sh
    printf '#!/bin/sh\ndocker run -d --label "$ENG_CONTAINER_LABEL" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine\n' > scripts/db.sh
    rm scripts/reset.sh scripts/login.sh
    expect 0 "doctor passes after the fixes" eng doctor
    expect 0 "motus case: proof script writes under the round" node scripts/proof-e2e.mjs
    check "it is inside ENG_SCRATCH" '[[ "$(node scripts/proof-e2e.mjs)" == "$ENG_SCRATCH"/* ]]'
    expect 0 "Core Edge case: cargo builds into the shared target" sh scripts/rust-build.sh
    expect 0 "equitus case: deno uses the stable DENO_DIR" sh scripts/deno-check.sh
    cid=$(sh scripts/db.sh); echo "$cid" > "$MARKS/cid"; check "labelled postgres started" '[ -n "$cid" ]'
    echo "$CARGO_TARGET_DIR|$DENO_DIR" > "$MARKS/caches-1"
    t=$(gh auth token 2>/dev/null); if [ -n "$t" ]; then grep -rlF -f <(printf %s "$t") "$ENG_SCRATCH" "$HOME/.cache/eng/eng-sandbox" 2>/dev/null | wc -l; else echo no-token; fi > "$MARKS/cred-files"; unset t
    finish ;;
  again)
    echo "$CARGO_TARGET_DIR|$DENO_DIR" > "$MARKS/caches-2"
    check "round 2 sees round 1's Cargo build in the shared target" '[ -f "$CARGO_TARGET_DIR/debug/hello" ]'
    check "round 2 sees the populated DENO_DIR" '[ -n "$(ls -A "$DENO_DIR" 2>/dev/null)" ]'
    finish ;;
  evidence)
    for d in pr-1 pr-2 pr-999999 "$(git rev-parse HEAD)"; do mkdir -p ".eng/evidence/$d" && echo log > ".eng/evidence/$d/log.txt"; done
    expect 0 "clean --evidence dry run" eng clean --evidence
    check "dry run removed nothing" '[ $(ls .eng/evidence | wc -l) = 4 ]'
    expect 0 "clean --evidence --apply" eng clean --evidence --apply
    check "merged PRs #1 and #2 cleared; unknown PR and legacy dir kept" '[ "$(ls .eng/evidence | sort | tr "\n" " ")" = "$(printf "%s\n" pr-999999 "$(git rev-parse HEAD)" | sort | tr "\n" " ")" ]'
    finish ;;
  containers)
    expect 0 "clean --containers dry run lists the labelled container" eng clean --containers
    expect 0 "clean --containers --apply" eng clean --containers --apply
    finish ;;
  esac
  exit 2
fi

# ---------- outer driver ----------
mkdir -p "${XDG_CACHE_HOME:-$HOME/.cache}"; MARKS=$(mktemp -d -p "${XDG_CACHE_HOME:-$HOME/.cache}" eng-hygiene-proof-marks-XXXXXX); export MARKS SANDBOX
trap 'rm -rf "$MARKS"' EXIT
T0=$(date +%s); SHARED_MODE=$(stat -c %a "$SANDBOX"); SHARED_STATUS=$(git -C "$SANDBOX" status --porcelain | wc -l)
ROOT="$HOME/.cache/eng/eng-sandbox/scratch"
echo "eng-standard $(node -p "require('$PKG/package.json').version") at $(git -C "$PKG" rev-parse --short HEAD); sandbox $SANDBOX"
cd "$SANDBOX" || exit 2
git fetch -q origin

printf '\n== 1. doctor + Warden cases inside one round at origin/main\n'
expect 0 "round 1" eng launch --ref origin/main -- bash "$SELF" --inner doctor
check "round dirs under $ROOT all removed" '[ -z "$(ls -A "$ROOT" 2>/dev/null)" ]'
check "no credential in the scratch root or caches" '[ "$(cat "$MARKS/cred-files")" = 0 ]'

printf '\n== 2. a failing round is removed too\n'
expect 7 "round exits 7" eng launch --ref origin/main -- sh -c 'echo "$ENG_SCRATCH" > "$MARKS/failing"; touch "$TMPDIR/big"; exit 7'
check "failing round removed" '[ ! -e "$(cat "$MARKS/failing")" ]'
expect 0 "verdict round" eng verdict round --ref origin/main -- sh -c 'echo "$ENG_SCRATCH" > "$MARKS/verdict"'
check "verdict round removed" '[ ! -e "$(cat "$MARKS/verdict")" ]'

printf '\n== 3. shared caches survive rounds\n'
expect 0 "round 2 (caches)" eng launch --ref origin/main -- bash "$SELF" --inner again
check "same CARGO_TARGET_DIR and DENO_DIR in both rounds" '[ "$(cat "$MARKS/caches-1")" = "$(cat "$MARKS/caches-2")" ]'
echo "   caches: $(cat "$MARKS/caches-1")"

printf '\n== 4. containers: labelled postgres removed with its anonymous volume\n'
CID=$(cat "$MARKS/cid"); VOL=$(docker inspect -f '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}{{end}}{{end}}' "$CID")
echo "   container ${CID:0:12}, anonymous volume ${VOL:0:12}"
check "container carries eng.repo=eng-sandbox" '[ "$(docker inspect -f "{{index .Config.Labels \"eng.repo\"}}" "$CID")" = eng-sandbox ]'
expect 0 "cleanup round" eng launch --ref origin/main -- bash "$SELF" --inner containers
check "container gone" '! docker inspect "$CID" >/dev/null 2>&1'
check "its anonymous volume gone" '! docker volume inspect "$VOL" >/dev/null 2>&1'

printf '\n== 5. evidence per PR, cleared on merge or close\n'
expect 0 "evidence round" eng launch --ref origin/main -- bash "$SELF" --inner evidence

printf '\n== 6. nothing in bare /tmp, shared checkout untouched\n'
NEW=$(find /tmp -maxdepth 1 -newermt "@$T0" -name '*eng-sandbox*' 2>/dev/null | wc -l)
check "no new eng-sandbox entries in /tmp ($NEW)" '[ "$NEW" = 0 ]'
check "shared checkout mode $SHARED_MODE and status unchanged" '[ "$(stat -c %a "$SANDBOX")" = "$SHARED_MODE" ] && [ "$(git -C "$SANDBOX" status --porcelain | wc -l)" = "$SHARED_STATUS" ]'
check "no leftover round worktrees in git" '! git -C "$SANDBOX" worktree list | grep -q "/.cache/eng/eng-sandbox/scratch/"'

printf '\nRESULT: %s (%d failed check(s))\n' "$([ $fails = 0 ] && echo PASS || echo FAIL)" "$fails"
exit $(( fails > 0 ))
