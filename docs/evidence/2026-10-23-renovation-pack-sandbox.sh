#!/usr/bin/env bash
# Renovation pack proof (spec v1 §10) on eng-sandbox only: audit -> baseline -> new finding fails, old passes -> verifier
# receipt -> isolated launch at 0700 -> drift-check. Rerunnable: each run makes a fresh eng launch worktree and proof branch.
# Leaves behind, in the sandbox repo only: the proof branch and its refs/notes/eng-verdict note. Nothing is pushed.
set -uo pipefail
SANDBOX=$(cd "${1:?usage: $0 <path to eng-sandbox> [ref]}" && pwd)
[ "$(basename "$SANDBOX")" = eng-sandbox ] || { echo "refusing: this proof runs on eng-sandbox only, not $SANDBOX"; exit 2; }
REF=${2:-exp/ticketstore-effect-vs-ts}
PKG=$(cd "$(dirname "$0")/../.." && pwd)
eng() { node "$PKG/bin/eng.mjs" "$@"; }
mode() { stat -c '%a' "$1"; }
fails=0
step() { printf '\n== %s\n' "$*"; }
expect() {
  local want=$1 desc=$2; shift 2
  local out; out=$("$@" 2>&1); local got=$?
  printf '%s\n' "$out" | sed 's/^/   /'
  if [ "$got" = "$want" ]; then echo "   OK   $desc (exit $got)"; else echo "   FAIL $desc (exit $got, want $want)"; fails=$((fails + 1)); fi
}
check() { if eval "$2"; then echo "   OK   $1"; else echo "   FAIL $1"; fails=$((fails + 1)); fi; }
commit() { git add -A && git commit -qm "$1" -m "$(printf 'Agent: renovation-proof-builder\nAgent-Family: claude')"; }
cfgset() { node -e "const fs=require('fs'),Y=require('$PKG/node_modules/yaml');const d=Y.parseDocument(fs.readFileSync('eng.config.yml','utf8'));d.setIn($1,d.createNode($2));fs.writeFileSync('eng.config.yml',String(d))"; }

echo "eng-standard $(node -p "require('$PKG/package.json').version") at $(git -C "$PKG" rev-parse --short HEAD); sandbox $SANDBOX ref $REF"
step "0. shared checkout before"
SHARED_MODE=$(mode "$SANDBOX"); echo "   mode $SHARED_MODE; origin: $(git -C "$SANDBOX" remote | wc -l) remote(s)"

step "1. isolated launch (spec §7)"
cd "$SANDBOX" || exit 2
L=$(eng launch --keep --ref "$REF" 2>&1); echo "$L" | sed 's/^/   /'
WT=$(echo "$L" | sed -n 's/^  worktree \(\S*\) .*/\1/p'); DIR=$(dirname "$WT")
check "launch dir, worktree and tmp are 0700" '[ "$(mode "$DIR")$(mode "$WT")$(mode "$DIR/tmp")" = 700700700 ]'
check "shared checkout still mode $SHARED_MODE" '[ "$(mode "$SANDBOX")" = "$SHARED_MODE" ]'
cd "$WT" || exit 2
export TMPDIR="$DIR/tmp"
git switch -qc "renovation-proof/$(date -u +%Y%m%dT%H%M%SZ)"; echo "   branch $(git branch --show-current)"

step "2. audit (spec §1): read-only outside renovation/"
expect 0 "audit" eng renovate audit
check "audit wrote only renovation/" '[ "$(git status --porcelain | cut -c4-)" = renovation/ ]'
expect 1 "apply refuses out of order" eng renovate apply baselines

step "3. step 1 docs-config (spec §3)"
expect 0 "apply docs-config" eng renovate apply docs-config --owner @Mattslayga
expect 0 "render --check right after apply" eng renovate render --check
commit "renovate step 1: docs-config"

step "4. fixture: one pre-existing finding (mirrors devbox-ops #4 scripts/start-secret-service.sh)"
mkdir -p scripts && printf '#!/bin/sh\n# fixture for the renovation proof: an intentional credential-recovery helper\n' > scripts/start-secret-service.sh
commit "fixture: pre-existing credential-recovery file for the renovation proof"
expect 1 "scan before the baseline: the old finding is not yet reviewed" eng renovate scan

step "5. step 2 baselines (spec §2)"
expect 0 "apply baselines" eng renovate apply baselines --reason "intentional credential-recovery helper (proof fixture)"
commit "renovate step 2: baselines"
expect 0 "gate passes on the old, baselined finding" eng renovate scan
mkdir -p config && echo '{}' > config/prod-credentials.json
expect 1 "gate fails on a new finding" eng renovate scan
rm -rf config

step "6. step 3 gates-warn + CI toolchain preflight (spec §4)"
echo 1.4.4 > .bun-version
cfgset "['renovation','ci']" "{provider:'buildkite',queue:'sandbox-linux-small',image:'sandbox-ci-v6',toolchain:{bun:'1.2.19',node:'24'}}"
expect 0 "apply gates-warn" eng renovate apply gates-warn --ci buildkite
expect 3 "preflight: Bun 1.4.4 vs image 1.2.19 is needs-decision, not red" eng renovate ci-preflight
commit "renovate step 3: gates-warn"

step "7. step 4 gates-enforce"
expect 0 "apply gates-enforce" eng renovate apply gates-enforce
commit "renovate step 4: gates-enforce"

step "8. step 5 verifier + receipt (spec §5)"
expect 0 "apply verifier" eng renovate apply verifier --adapter core-edge.ship-receipt/v1
commit "renovate step 5: verifier"
echo "   (verdict below is recorded by this script under a stand-in verifier identity to prove the receipt mechanics; the PR's real verdict comes from an independent verifier)"
expect 0 "verdict records provider" eng verdict PASS --by renovation-proof-verifier --family gpt --provider openai --model stand-in --session proof-verifier-session
expect 0 "verdict check accepts it (different family from the builder)" eng verdict check
expect 0 "receipt draft" eng renovate receipt --pr 1 --author-session proof-builder-session
R="renovation/receipts/$(git rev-parse HEAD).md"
check "receipt binds head, base tip, head tree and providers" "node -e \"const b=require('fs').readFileSync('$R','utf8'),r=JSON.parse(b.match(/\\\`\\\`\\\`json\\n([\\s\\S]+)\\n\\\`\\\`\\\`/)[1]);const g=c=>require('child_process').execSync('git rev-parse '+c).toString().trim();process.exit(b.startsWith('<!-- core-edge.ship-receipt/v1 -->')&&r.head_sha===g('HEAD')&&r.base_sha===g('main')&&r.diff_fingerprint===g('HEAD^{tree}')&&r.reviewer.provider==='openai'&&r.reviewer.author_provider==='anthropic'&&r.reviewer.fresh_context===true?0:1)\""
expect 0 "refresh: verdict current, receipt is a draft for this head" eng renovate refresh

step "9. step 6 e2e / native proof ledger (spec §6)"
ln -s "$SANDBOX/a-zod/node_modules" a-zod/node_modules && echo a-zod/node_modules >> .gitignore   # .gitignore's node_modules/ does not match a symlink
cfgset "['project','commands','test']" "'cd a-zod && npx --no-install vitest run'"
expect 0 "apply e2e" eng renovate apply e2e
cfgset "['renovation','proof','gates']" "[{name:'test',command:'cd a-zod && npx --no-install vitest run',timeout_s:300},{name:'heavy',command:'sleep 3',timeout_s:1}]"
commit "renovate step 6: e2e proof gates"
expect 3 "prove: heavy gate times out, recorded blocked, NOT PROVED" eng renovate prove
expect 0 "prove resumes: test kept, heavy re-run with a longer timeout" eng renovate prove --timeout 30
cfgset "['renovation','proof','gates',1,'command']" "'sleep 1'"
expect 1 "prove refuses an uncommitted gate edit (the ledger binds a commit)" eng renovate prove
git checkout -q eng.config.yml
check "ledger is proved for this sha" "node -e \"process.exit(require('./renovation/proof/$(git rev-parse HEAD).json').result==='proved'?0:1)\""

step "10. step 7 launch contract"
expect 0 "apply launch" eng renovate apply launch
commit "renovate step 7: launch contract"

step "11. drift-check (spec §7)"
expect 0 "render --check passes" eng renovate render --check
echo "hand edit" >> SHIPPING.md
expect 1 "render --check fails on a hand edit" eng renovate render --check
git checkout -q SHIPPING.md
expect 0 "render --check passes again" eng renovate render --check

step "12. final audit and plan"
expect 0 "audit" eng renovate audit
expect 0 "plan" eng renovate plan

step "13. cleanup"
rm a-zod/node_modules; sed -i '/^a-zod\/node_modules$/d' .gitignore; commit "renovation proof: audit and ledger"
BR=$(git branch --show-current)
cd "$SANDBOX" || exit 2
expect 0 "launch down (no --force)" eng launch down "$DIR"
check "shared checkout still mode $SHARED_MODE" '[ "$(mode "$SANDBOX")" = "$SHARED_MODE" ]'
echo "   proof branch kept in the sandbox repo: $BR"

printf '\nRESULT: %s (%d failed check(s))\n' "$([ $fails = 0 ] && echo PASS || echo FAIL)" "$fails"
exit $(( fails > 0 ))
