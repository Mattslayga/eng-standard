// Merge rule v0.10.0 (option 2): strict mode (up to date + PASS bound to the exact head) by default, merge queue (PASS bound
// to the queued patch-id) where the repo supports it; second provider for gate/auth/billing; auto-revert provenance;
// verifier identity; stuck and restart; and the eng merge / eng verdict --pr CLI against a fake gh.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import YAML from 'yaml';
import { gateDecision, parseVerdicts, trusted, verdictBody, authorsFrom, groupPr, stuckDecision, restartDecision, validateAuto, autoConfig, ownerOf, detectMode, BOT } from '../lib/merge-queue.mjs';
// eng's scratch root and shared caches live under XDG_CACHE_HOME: keep them inside this run, never in the real ~/.cache.
process.env.XDG_CACHE_HOME = fs.mkdtempSync(path.join(process.env.ENG_TMP ?? os.tmpdir(), 'eng-xdg-'));
process.on('exit', () => fs.rmSync(process.env.XDG_CACHE_HOME, { recursive: true, force: true }));

const ENG = path.resolve(new URL('../bin/eng.mjs', import.meta.url).pathname);
const ROOTCFG = path.resolve(new URL('../eng.config.yml', import.meta.url).pathname);
const q = autoConfig(YAML.parse(fs.readFileSync(ROOTCFG, 'utf8')));
const qq = { ...q, mode: 'queue' };
const authors = authorsFrom(['feat\n\nAgent: builder-1\nAgent-Family: claude'], ['t@t']);
const H = 'a'.repeat(40);
const V = (o = {}) => ({ patch_id: 'p1', sha: H, result: 'PASS', by: 'verifier-1', family: 'gpt', provider: 'openai', at: '2026-10-24T01:00:00Z', ...o });
const head = (o = {}) => ({ kind: 'head', sha: H, upToDate: true, ...o });
const patch = { kind: 'patch', patchId: 'p1' };

test('strict (default): the PASS must be for the exact head and the branch must be up to date', () => {
  assert.equal(q.mode, 'strict');
  assert.equal(gateDecision({ bind: head(), files: ['docs/a.md'], verdicts: [V()], authors, q }).pass, true);
  let d = gateDecision({ bind: head({ upToDate: false }), files: ['docs/a.md'], verdicts: [V()], authors, q });
  assert.equal(d.pass, false); assert.equal(d.need, 'update');
  d = gateDecision({ bind: head(), files: ['docs/a.md'], verdicts: [V({ sha: 'b'.repeat(40) })], authors, q });
  assert.equal(d.pass, false, 'a PASS for an earlier head (same patch-id) does not carry in strict mode'); assert.equal(d.need, 'verdict');
});

test('queue: the PASS binds the patch-id; author verdicts never count; the latest independent verdict decides', () => {
  let d = gateDecision({ bind: patch, files: ['docs/a.md'], verdicts: [], authors, q: qq });
  assert.equal(d.need, 'verdict');
  d = gateDecision({ bind: patch, files: ['docs/a.md'], verdicts: [V({ by: 'builder-1' }), V({ family: 'claude', by: 'x' }), V({ patch_id: 'p0' })], authors, q: qq });
  assert.equal(d.pass, false); assert.match(d.reasons.join(), /builder-1 \(gpt\) wrote or shares a family/);
  assert.equal(gateDecision({ bind: patch, files: ['docs/a.md'], verdicts: [V({ sha: 'c'.repeat(40) })], authors, q: qq }).pass, true, 'queue mode binds the patch, not the head');
  d = gateDecision({ bind: patch, files: ['docs/a.md'], verdicts: [V(), V({ by: 'verifier-2', result: 'FAIL' })], authors, q: qq });
  assert.equal(d.need, 'fix'); assert.equal(d.fail.by, 'verifier-2');
  assert.equal(gateDecision({ bind: patch, files: ['docs/a.md'], verdicts: [V({ result: 'FAIL' }), V({ by: 'v3' })], authors, q: qq }).pass, true, 'a later PASS after a fix round counts');
});

test('second provider: gate, auth and billing paths need PASSes from two providers other than the authors', () => {
  for (const f of ['.github/workflows/ci.yml', 'bin/eng.mjs', 'eng.config.yml', 'src/auth/login.ts', 'app/billing/plan.ts', 'lib/merge-queue.mjs', 'lib/hygiene.mjs']) {
    const one = gateDecision({ bind: head(), files: [f], verdicts: [V(), V({ by: 'verifier-3' })], authors, q });
    assert.equal(one.pass, false, f); assert.equal(one.need, 'second-provider');
  }
  const two = gateDecision({ bind: head(), files: ['bin/eng.mjs'], verdicts: [V(), V({ by: 'gemini-1', family: 'gemini', provider: 'google' })], authors, q });
  assert.equal(two.pass, true, two.reasons.join()); assert.match(two.reasons.at(-1), /openai \+ google/);
  assert.equal(gateDecision({ bind: head(), files: ['bin/eng.mjs'], verdicts: [V(), V({ by: 'c2', family: 'claude-x', provider: 'anthropic' })], authors, q }).pass, false, 'the author provider does not count as the second');
});

test('verifier identity: with verifier_logins only listed logins count, with their own provider (round-1 P1: impersonation)', () => {
  const comments = [{ user: { login: 'builder' }, body: verdictBody(V({ by: 'fake-gpt' })), created_at: '2026-10-24T01:00:00Z' },
    { user: { login: 'builder' }, body: verdictBody(V({ by: 'fake-gemini', family: 'gemini', provider: 'google' })), created_at: '2026-10-24T01:01:00Z' }];
  const claimed = gateDecision({ bind: head(), files: ['src/auth/x.ts'], verdicts: parseVerdicts(comments), authors, q });
  assert.equal(claimed.pass, true, 'self-declared mode trusts the claims (eng doctor flags this mode)');
  const logins = { 'gpt-verifier-bot': 'openai', 'gemini-verifier-bot': 'google' };
  assert.equal(gateDecision({ bind: head(), files: ['src/auth/x.ts'], verdicts: trusted(parseVerdicts(comments), logins), authors, q }).need, 'verdict', 'claims from an unlisted login are ignored');
  const real = [{ user: { login: 'gpt-verifier-bot' }, body: verdictBody(V({ provider: 'xai' })), created_at: '2026-10-24T01:00:00Z' }, { user: { login: 'gemini-verifier-bot' }, body: verdictBody(V({ by: 'g', family: 'gemini' })), created_at: '2026-10-24T01:01:00Z' }];
  const t = trusted(parseVerdicts(real), logins);
  assert.deepEqual(t.map(v => v.provider), ['openai', 'google'], 'the provider comes from the login, not the claim');
  assert.equal(gateDecision({ bind: head(), files: ['src/auth/x.ts'], verdicts: t, authors, q }).pass, true);
  assert.match(validateAuto({ method: 'squash', auto: { second_provider_paths: ['x'], verifier_logins: { a: 'devin' } } }).join(), /verifier_logins/);
});

test('auto-revert: needs bot provenance, the auto-revert/<sha12> branch, a shipped target and an exact inverse (round-1 P1)', () => {
  const of = 'b'.repeat(40), good = { of, author: BOT, byBot: true, branch: `auto-revert/${of.slice(0, 12)}`, branchOk: true, shipped: true, matches: true };
  assert.equal(gateDecision({ bind: head(), files: ['bin/eng.mjs'], verdicts: [], authors, q, revert: good }).pass, true);
  assert.equal(gateDecision({ bind: patch, files: ['bin/eng.mjs'], verdicts: [], authors, q: qq, revert: good }).pass, true);
  for (const [k, v, re] of [['shipped', false, /not on main/], ['byBot', false, /opened by builder/], ['branchOk', false, /not auto-revert/], ['matches', false, /not its exact inverse/]]) {
    const d = gateDecision({ bind: head(), files: ['bin/eng.mjs'], verdicts: [], authors, q, revert: { ...good, author: 'builder', [k]: v, ...(k === 'byBot' ? {} : { author: BOT }) } });
    assert.equal(d.pass, false, k); assert.match(d.reasons[0], re);
  }
  assert.equal(gateDecision({ bind: head({ upToDate: false }), files: [], verdicts: [], authors, q, revert: good }).need, 'update');
});

test('detect mode: user-owned repos have no queue; org public repos can; an active merge_queue rule means queue mode', () => {
  const strictRs = [{ enforcement: 'active', rules: [{ type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: 'test' }] } }] }];
  let m = detectMode({ ownerType: 'User', visibility: 'public', rulesets: strictRs });
  assert.deepEqual([m.queueSupported, m.mode, m.strictActive, m.required], [false, 'strict', true, ['test']]);
  m = detectMode({ ownerType: 'Organization', visibility: 'public', rulesets: [] });
  assert.equal(m.queueSupported, true); assert.equal(m.queueActive, false);
  m = detectMode({ ownerType: 'Organization', visibility: 'public', rulesets: [{ enforcement: 'active', rules: [{ type: 'merge_queue' }] }] });
  assert.equal(m.mode, 'queue');
  assert.equal(detectMode({ ownerType: 'Organization', visibility: 'private', rulesets: [] }).queueSupported, false);
});

test('stuck: red or missing required check with no activity for 30 minutes', () => {
  const now = Date.parse('2026-10-24T02:00:00Z'), at = m => new Date(now - m * 60e3).toISOString();
  assert.equal(stuckDecision({ check: null, lastActivity: at(31), now, minutes: 30 }).stuck, true);
  assert.equal(stuckDecision({ check: { status: 'completed', conclusion: 'failure' }, lastActivity: at(45), now, minutes: 30 }).stuck, true);
  assert.equal(stuckDecision({ check: { status: 'completed', conclusion: 'failure' }, lastActivity: at(10), now, minutes: 30 }).stuck, false);
  assert.equal(stuckDecision({ check: { status: 'in_progress' }, lastActivity: at(90), now, minutes: 30 }).stuck, false);
  assert.equal(stuckDecision({ check: { status: 'completed', conclusion: 'success' }, lastActivity: at(90), now, minutes: 30 }).stuck, false);
});

test('restart: follows what the gate still needs; a missing second-provider PASS restarts too; each cause once delivered (round-1 P2s)', () => {
  const now = Date.parse('2026-10-24T02:00:00Z'), old = new Date(now - 31 * 60e3).toISOString(), fresh = new Date(now - 5 * 60e3).toISOString();
  const fail = gateDecision({ bind: head(), files: ['docs/a.md'], verdicts: [V({ result: 'FAIL', evidence: 'nd7x' })], authors, q });
  let r = restartDecision({ gate: fail, head: H, headAt: fresh, now, waitMinutes: 30 });
  assert.equal(r.restart, true); assert.match(r.reason, /verdict FAIL by verifier-1.*evidence nd7x/);
  assert.equal(restartDecision({ gate: fail, head: H, headAt: fresh, now, waitMinutes: 30, delivered: new Set([r.key]) }).restart, false);
  const second = gateDecision({ bind: head(), files: ['src/auth/a.ts'], verdicts: [V()], authors, q });
  r = restartDecision({ gate: second, head: H, headAt: old, now, waitMinutes: 30 });
  assert.equal(r.restart, true); assert.match(r.reason, /no second-provider PASS 31 min/);
  const none = gateDecision({ bind: head(), files: ['docs/a.md'], verdicts: [], authors, q });
  assert.equal(restartDecision({ gate: none, head: H, headAt: fresh, now, waitMinutes: 30 }).restart, false);
  assert.match(restartDecision({ gate: none, head: H, headAt: old, now, waitMinutes: 30 }).reason, /no verdict 31 min/);
  assert.equal(restartDecision({ gate: gateDecision({ bind: head(), files: ['docs/a.md'], verdicts: [V()], authors, q }), head: H, headAt: old, now, waitMinutes: 30 }).restart, false);
});

test('config: one merge.auto block, mode strict or queue, squash, second-provider paths listed', () => {
  assert.deepEqual(validateAuto(YAML.parse(fs.readFileSync(ROOTCFG, 'utf8')).merge), []);
  assert.match(validateAuto({ method: 'merge', auto: { mode: 'fast', second_provider_paths: [] } }).join(), /mode must be strict or queue.*squash.*second_provider_paths/);
  assert.equal(groupPr('refs/heads/gh-readonly-queue/main/pr-19-4cc0857a09db6aac19544f78a23889c0542d0fff'), 19);
  assert.equal(ownerOf('Owner: mcp:abc\nbody', authors), 'mcp:abc'); assert.equal(ownerOf('', authors), 'builder-1');
});

// ---------- CLI against a fake gh: responses are files under .gh/ keyed by API path ----------
let dir, ghd, calls;
const git = c => execSync(`git ${c}`, { cwd: dir, stdio: 'pipe', encoding: 'utf8' }).trim();
const pidOf = range => execSync(`git diff --binary ${range} | git patch-id --stable`, { cwd: dir, encoding: 'utf8' }).split(' ')[0];
const put = (k, v) => fs.writeFileSync(path.join(ghd, k.replace(/[^a-z0-9]+/gi, '_')), JSON.stringify(v));
const eng = (args, extra = {}) => spawnSync(process.execPath, [ENG, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${path.join(dir, '.bin')}:${process.env.PATH}`, GH_DIR: ghd, GH_CALLS: calls, GITHUB_REPOSITORY: 'o/r', GITHUB_EVENT_PATH: '', GITHUB_STEP_SUMMARY: '', GITHUB_SHA: '', ENG_PR: '', ENG_RESTART_WEBHOOK: '', ...extra } });
// The mode is main's config, committed there, so a PR fixture never carries the config change itself.
const setMode = mode => {
  git('checkout -q --detach origin/main'); const p = path.join(dir, 'eng.config.yml'), t = fs.readFileSync(p, 'utf8'), n = t.replace(/mode: (strict|queue)/, `mode: ${mode}`);
  if (n !== t) { fs.writeFileSync(p, n); git(`commit -qam "mode ${mode}"`); git('update-ref refs/remotes/origin/main HEAD'); }
};
before(() => {
  dir = fs.mkdtempSync(path.join(process.env.ENG_TMP ?? os.tmpdir(), 'eng-mq-')); ghd = path.join(dir, '.gh'); calls = path.join(dir, '.gh-calls');
  fs.mkdirSync(ghd); fs.mkdirSync(path.join(dir, '.bin'));
  fs.writeFileSync(path.join(dir, '.bin/gh'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$GH_CALLS"
[[ "$1" == "pr" && "$2" == "view" ]] && { echo "{\\"headRefOid\\":\\"$(git rev-parse HEAD)\\",\\"state\\":\\"OPEN\\"}"; exit 0; }
p=""; for x in "$@"; do [[ "$x" == repos/* ]] && p="$x"; done
k=$(printf '%s' "$p" | sed 's/[^A-Za-z0-9]\\{1,\\}/_/g')
if [[ -n "$p" && -f "$GH_DIR/$k" ]]; then cat "$GH_DIR/$k"; else echo '{}'; fi
`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, '.bin/curl'), '#!/usr/bin/env bash\nprintf "curl\\n" >> "$GH_CALLS"; exit "${FAKE_CURL_EXIT:-0}"\n', { mode: 0o755 });
  git('init -q -b main'); git('config user.email t@t'); git('config user.name t');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.bin/\n.gh/\n.gh-calls\n');
  fs.copyFileSync(ROOTCFG, path.join(dir, 'eng.config.yml'));
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
  git('add -A'); git('commit -qm base'); git('update-ref refs/remotes/origin/main HEAD');
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

function prWith(file, { behind = false } = {}) {
  git('checkout -q -B feat origin/main'); fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), `change ${file}\n`);
  git('add -A'); git(`commit -qm "change ${file}" -m "Agent: builder-1\nAgent-Family: claude"`);
  const head = git('rev-parse HEAD'), patch = pidOf(`origin/main ${head}`);
  if (behind) { git('checkout -q --detach origin/main'); fs.writeFileSync(path.join(dir, 'other.md'), `o${Date.now()}\n`); git('add -A'); git('commit -qm other'); git('update-ref refs/remotes/origin/main HEAD'); }
  git('checkout -q --detach origin/main'); git('merge -q --squash feat'); git('commit -qm "group"');
  const group = git('rev-parse HEAD');
  const evq = path.join(dir, '.gh/event-q.json'); fs.writeFileSync(evq, JSON.stringify({ merge_group: { head_sha: group, base_sha: git('rev-parse origin/main'), head_ref: `refs/heads/gh-readonly-queue/main/pr-7-${head}` } }));
  const evp = path.join(dir, '.gh/event-p.json'); fs.writeFileSync(evp, JSON.stringify({ pull_request: { number: 7, head: { sha: head } } }));
  put('repos/o/r/pulls/7', { number: 7, labels: [], body: '', user: { login: 'builder' }, head: { sha: head, ref: 'feat' }, base: { ref: 'main' } });
  put('repos/o/r/pulls/7/commits?per_page=100', [[{ commit: { message: `change ${file}\n\nAgent: builder-1\nAgent-Family: claude`, author: { email: 't@t' } } }]]);
  return { head, patch, group, evq, evp };
}
const comments = (vs, n = 7) => put(`repos/o/r/issues/${n}/comments?per_page=100`, [vs.map((v, i) => ({ user: { login: 'shared' }, body: verdictBody(v), created_at: `2026-10-24T0${i}:00:00Z` }))]);

test('eng merge gate, strict (pull_request): PASS bound to the exact head; a behind branch fails until updated', () => {
  setMode('strict');
  let pr = prWith('docs/guide.md');
  comments([]);
  let r = eng(['merge', 'gate'], { GITHUB_EVENT_PATH: pr.evp });
  assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stdout, /test: FAIL for PR #7 head [0-9a-f]{8} \(strict\), bound to head/); assert.match(r.stdout, /self-declared/);
  comments([V({ patch_id: pr.patch, sha: pr.head })]);
  r = eng(['merge', 'gate'], { GITHUB_EVENT_PATH: pr.evp });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  pr = prWith('docs/guide2.md', { behind: true });
  comments([V({ patch_id: pr.patch, sha: pr.head })]);
  r = eng(['merge', 'gate'], { GITHUB_EVENT_PATH: pr.evp });
  assert.equal(r.status, 1); assert.match(r.stdout, /behind main: update the branch/);
});

test('eng merge gate, queue (merge_group): binds the queued patch-id; gate files need a second provider', () => {
  setMode('queue');
  let pr = prWith('docs/q.md');
  comments([V({ patch_id: pr.patch, sha: pr.head })]);
  assert.equal(pidOf(`${pr.group}^ ${pr.group}`), pr.patch, 'the squashed queue commit has the PR patch-id');
  let r = eng(['merge', 'gate'], { GITHUB_EVENT_PATH: pr.evq });
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /merge_group .* \(PR #7\), bound to patch-id/);
  pr = prWith('bin/tool.mjs');
  comments([V({ patch_id: pr.patch, sha: pr.head })]);
  r = eng(['merge', 'gate'], { GITHUB_EVENT_PATH: pr.evq });
  assert.equal(r.status, 1); assert.match(r.stdout, /need PASSes from two providers/);
  comments([V({ patch_id: pr.patch, sha: pr.head }), V({ patch_id: pr.patch, sha: pr.head, by: 'gemini-1', family: 'gemini', provider: 'google' })]);
  assert.equal(eng(['merge', 'gate'], { GITHUB_EVENT_PATH: pr.evq }).status, 0);
  setMode('strict');
});

test('eng merge gate: an auto-revert passes only from the bot, on its branch, for a shipped commit; dispatch carries the PR (round-1 P1s)', () => {
  git('checkout -q --detach origin/main'); fs.writeFileSync(path.join(dir, 'bad.txt'), 'bad\n'); git('add -A'); git('commit -qm bad');
  const bad = git('rev-parse HEAD'); git('update-ref refs/remotes/origin/main HEAD');
  git(`checkout -q -B auto-revert/${bad.slice(0, 12)} origin/main`); git('revert --no-edit HEAD'); const head = git('rev-parse HEAD');
  const pr = (o = {}) => put('repos/o/r/pulls/9', { number: 9, labels: [{ name: 'auto-revert' }], body: `<!-- eng-auto-revert of=${bad} -->`, user: { login: BOT }, head: { sha: head, ref: `auto-revert/${bad.slice(0, 12)}` }, base: { ref: 'main' }, ...o });
  put('repos/o/r/pulls/9/commits?per_page=100', [[{ commit: { message: 'Revert', author: { email: 'bot@x' } } }]]); comments([], 9);
  const dispatch = path.join(dir, '.gh/event-d.json'); fs.writeFileSync(dispatch, JSON.stringify({ inputs: { pr: '9' } }));
  pr();
  let r = eng(['merge', 'gate'], { GITHUB_EVENT_PATH: dispatch, GITHUB_SHA: head });
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /auto-revert of [0-9a-f]{8} by github-actions\[bot\]/);
  assert.match(out(eng(['merge', 'gate'], { GITHUB_EVENT_PATH: dispatch, GITHUB_SHA: bad })), /dispatched on .* but PR #9 head is/);
  pr({ user: { login: 'builder' } });
  r = eng(['merge', 'gate'], { GITHUB_EVENT_PATH: dispatch, GITHUB_SHA: head }); assert.equal(r.status, 1); assert.match(r.stdout, /opened by builder/);
  git('checkout -q -B side origin/main~1'); fs.writeFileSync(path.join(dir, 'never.txt'), 'n\n'); git('add -A'); git('commit -qm never'); const never = git('rev-parse HEAD');
  pr({ body: `<!-- eng-auto-revert of=${never} -->`, head: { sha: head, ref: `auto-revert/${never.slice(0, 12)}` } });
  r = eng(['merge', 'gate'], { GITHUB_EVENT_PATH: dispatch, GITHUB_SHA: head }); assert.equal(r.status, 1); assert.match(r.stdout, /is not on main/);
});

test('eng merge watch --dry-run: stuck flag, restart on FAIL, update-branch for a behind auto-merge PR', () => {
  git('checkout -q -B feat2 origin/main'); fs.writeFileSync(path.join(dir, 'w.md'), 'w\n'); git('add -A'); git('commit -qm w -m "Agent: builder-9\nAgent-Family: claude"');
  const head = git('rev-parse HEAD'), old = new Date(Date.now() - 45 * 60e3).toISOString();
  const pr8 = { number: 8, draft: false, head: { sha: head, ref: 'feat2' }, base: { ref: 'main' }, labels: [], updated_at: old, body: 'Owner: mcp:owner-thread', html_url: 'https://x/8', user: { login: 'builder' } };
  put('repos/o/r/pulls?state=open&base=main&per_page=100', [[pr8]]);
  put('repos/o/r/pulls/8/commits?per_page=100', [[{ commit: { message: 'w\n\nAgent: builder-9\nAgent-Family: claude', author: { email: 't@t' }, committer: { date: old } } }]]);
  comments([V({ patch_id: 'x', sha: head, result: 'FAIL', evidence: 'nd7e' })], 8);
  put(`repos/o/r/commits/${head}/check-runs?check_name=test&filter=latest`, { check_runs: [{ status: 'completed', conclusion: 'failure', completed_at: old }] });
  fs.writeFileSync(calls, '');
  let r = eng(['merge', 'watch', '--dry-run']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /#8 [0-9a-f]{8}: STUCK \(required check failure on head, no activity for 4\d min\); gate needs fix/);
  assert.match(r.stdout, /#8: RESTART owner mcp:owner-thread: verdict FAIL by verifier-1/);
  assert.doesNotMatch(fs.readFileSync(calls, 'utf8'), /-X (POST|PUT)/, 'dry run posts nothing');
  git('checkout -q --detach origin/main'); fs.writeFileSync(path.join(dir, 'moved.md'), 'm\n'); git('add -A'); git('commit -qm moved'); git('update-ref refs/remotes/origin/main HEAD');
  put('repos/o/r/pulls?state=open&base=main&per_page=100', [[{ ...pr8, auto_merge: { merge_method: 'squash' } }]]);
  r = eng(['merge', 'watch', '--dry-run']);
  assert.match(r.stdout, /#8: behind main with auto-merge on: would update the branch/);
});

test('eng merge watch --dry-run: re-arms auto-merge once the gate passes; the hold label disarms it', () => {
  git('checkout -q -B feat5 origin/main'); fs.writeFileSync(path.join(dir, 'a5.md'), 'a\n'); git('add -A'); git('commit -qm a5 -m "Agent: builder-9\nAgent-Family: claude"');
  const head = git('rev-parse HEAD'), now = new Date().toISOString();
  const base = { number: 11, draft: false, head: { sha: head, ref: 'feat5' }, base: { ref: 'main' }, labels: [], updated_at: now, body: '', html_url: 'https://x/11', user: { login: 'b' } };
  put('repos/o/r/pulls/11/commits?per_page=100', [[{ commit: { message: 'a5\n\nAgent: builder-9\nAgent-Family: claude', author: { email: 't@t' }, committer: { date: now } } }]]);
  comments([V({ patch_id: 'x', sha: head })], 11);
  put(`repos/o/r/commits/${head}/check-runs?check_name=test&filter=latest`, { check_runs: [{ status: 'completed', conclusion: 'success', completed_at: now }] });
  put('repos/o/r/pulls?state=open&base=main&per_page=100', [[base]]);
  let r = eng(['merge', 'watch', '--dry-run']);
  assert.match(r.stdout, /#11: gate PASS, auto-merge off: would re-arm it/);
  put('repos/o/r/pulls?state=open&base=main&per_page=100', [[{ ...base, labels: [{ name: 'hold' }], auto_merge: { merge_method: 'squash' } }]]);
  r = eng(['merge', 'watch', '--dry-run']);
  assert.match(r.stdout, /#11: hold: would turn auto-merge off/); assert.doesNotMatch(r.stdout, /would re-arm/);
});

test('eng merge watch: a failed restart delivery is retried, and noted once (round-1 P2)', () => {
  git('checkout -q -B feat4 origin/main'); fs.writeFileSync(path.join(dir, 'r.md'), 'r\n'); git('add -A'); git('commit -qm r -m "Agent: builder-9\nAgent-Family: claude"');
  const head = git('rev-parse HEAD'), now = new Date().toISOString();
  put('repos/o/r/pulls?state=open&base=main&per_page=100', [[{ number: 10, draft: false, head: { sha: head, ref: 'feat4' }, base: { ref: 'main' }, labels: [], updated_at: now, body: '', html_url: 'https://x/10', user: { login: 'b' } }]]);
  put('repos/o/r/pulls/10/commits?per_page=100', [[{ commit: { message: 'r\n\nAgent: builder-9\nAgent-Family: claude', author: { email: 't@t' }, committer: { date: now } } }]]);
  put(`repos/o/r/commits/${head}/check-runs?check_name=test&filter=latest`, { check_runs: [{ status: 'completed', conclusion: 'failure', completed_at: now }] });
  const failV = V({ patch_id: 'x', sha: head, result: 'FAIL' }), key = `fail:verifier-1:2026-10-24T00:00:00Z`;
  comments([failV], 10); fs.writeFileSync(calls, '');
  eng(['merge', 'watch'], { ENG_RESTART_WEBHOOK: 'https://hook', FAKE_CURL_EXIT: '22' });
  put('repos/o/r/issues/10/comments?per_page=100', [[{ user: { login: 'shared' }, body: verdictBody(failV), created_at: '2026-10-24T00:00:00Z' }, { body: `<!-- eng-restart/v1 key=${key} -->\nWebhook: failed (curl exit 22); retried next run.` }]]);
  eng(['merge', 'watch'], { ENG_RESTART_WEBHOOK: 'https://hook', FAKE_CURL_EXIT: '22' });
  let log = fs.readFileSync(calls, 'utf8');
  assert.equal(log.split('\n').filter(l => l === 'curl').length, 2, 'a failed delivery is attempted again');
  assert.equal(log.split('\n').filter(l => /issues\/10\/comments --input/.test(l)).length, 1, 'the failure is noted once, not every run');
  eng(['merge', 'watch'], { ENG_RESTART_WEBHOOK: 'https://hook', FAKE_CURL_EXIT: '0' });
  log = fs.readFileSync(calls, 'utf8');
  assert.equal(log.split('\n').filter(l => /issues\/10\/comments --input/.test(l)).length, 2, 'an acknowledged delivery is recorded');
});

test('eng merge post --dry-run and eng verdict --pr', () => {
  git('checkout -q --detach origin/main');
  const p = path.join(dir, 'eng.config.yml'), cfg = fs.readFileSync(p, 'utf8');
  fs.writeFileSync(p, cfg.replace('post_merge: { check: "bash scripts/shipped-artifact-check.sh" }', 'post_merge: { check: "true" }'));
  let r = eng(['merge', 'post', '--dry-run']); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /PASS on/);
  fs.writeFileSync(p, cfg.replace('post_merge: { check: "bash scripts/shipped-artifact-check.sh" }', 'post_merge: { check: "exit 4" }'));
  r = eng(['merge', 'post', '--dry-run']); assert.equal(r.status, 1); assert.match(r.stdout, /would open an auto-revert PR from auto-revert\//);
  fs.writeFileSync(p, cfg);
  git('checkout -q -B feat3 origin/main'); fs.writeFileSync(path.join(dir, 'v.md'), 'v\n'); git('add -A'); git('commit -qm v -m "Agent: builder-1\nAgent-Family: claude"');
  fs.writeFileSync(calls, '');
  r = eng(['verdict', 'PASS', '--by', 'verifier-1', '--family', 'gpt', '--provider', 'openai', '--pr', '7']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const log = fs.readFileSync(calls, 'utf8');
  assert.match(log, /api -X POST repos\/o\/r\/issues\/7\/comments --input -/);
  assert.match(log, new RegExp(`statuses/${git('rev-parse HEAD')} -f state=success -f context=verdict`));
});
const out = r => r.stdout + r.stderr;
