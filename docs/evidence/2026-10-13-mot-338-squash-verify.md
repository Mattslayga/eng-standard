# MOT-338: red main after squash merge (motus-app #286), evidence

**Symptom.** motus-app main `f193b345` (squash of PR #286, PR head `9e9dc196`) failed the Eng gate twice:
push run 38398218640 and re-run (workflow_dispatch) 38404799032. Only `verify` failed; the gate summary printed just
`FAIL verify eng: FAIL verify maintain:` with the detail lines dropped.

**Full output (reproduced read-only on a motus-app clone at f193b345, notes fetched, eng v0.6.0 CLI):**

```
  motus-eng-notes-identity: pass x3 | new SHA, patch changed since f7b69ba6 | STALE: last proven Infinity commits ago
  motus-mcp-readonly: pass x3 | new SHA, patch changed since f7b69ba6 | STALE: last proven Infinity commits ago
eng: FAIL verify maintain:
  motus-eng-notes-identity stale
  motus-mcp-readonly stale
```

**Root cause (bin/eng.mjs verifyMaintain, unchanged from v0.3.0 through v0.6.0).**
1. `prev = allNotes().filter(check).at(-1)` takes the last record in `git notes list` order, which is sorted by
   annotated SHA, not by time. It picked `f7b69ba6`, a PR-branch commit.
2. After the squash merge and branch deletion that commit is not in the main checkout, so
   `git rev-list --count f7b69ba6..HEAD` throws and age became `Infinity`, i.e. STALE. Both checks themselves passed x3.
3. On main HEAD equals base, so the patch-id was `empty` and could never match the PR's records.
4. `eng gate` printed only the first failure line, hiding (1)-(2).

**Fix (v0.6.1).** On the default branch the patch-id is that of the merged change (`HEAD^..HEAD`), which for a
squash equals the PR branch's patch-id. Records are ordered by time, a same-patch record is preferred, age is the
minimum across records, and an unreachable record counts as fresh only if it proved the same patch (otherwise it is
ignored; reported as "no reachable or same-patch proof", never "Infinity commits"). `eng verdict check` on main
reports the merged change's verdict by the same patch-id. `eng gate` prints a failing subcommand's detail lines.

**Confirmation.** Fixed CLI on the same clone at f193b345:

```
  motus-eng-notes-identity: pass x3 | new SHA, same patch-id as 9e9dc196 (merge-in or squash)
  motus-mcp-readonly: pass x3 | new SHA, same patch-id as 9e9dc196 (merge-in or squash)
eng verify maintain: PASS (2 checks re-verified on f193b345)
```

Regression: `test/squash.test.mjs` (fails on v0.6.0 with the same STALE Infinity message, passes on v0.6.1).
