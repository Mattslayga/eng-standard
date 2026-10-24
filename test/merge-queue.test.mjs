// Merge rule v0.10.0: the merge gate (patch-id verdicts, second provider for gate/auth/billing, exact-inverse reverts),
// stuck and restart decisions, and the eng merge / eng verdict --pr CLI against a fake gh.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import YAML from 'yaml';
import { gateDecision, parseVerdicts, verdictBody, authorsFrom, groupPr, stuckDecision, restartDecision, validateQueue, queueConfig, ownerOf } from '../lib/merge-queue.mjs';

const ENG = path.resolve(new URL('../bin/eng.mjs', import.meta.url).pathname);
const ROOTCFG = path.resolve(new URL('../eng.config.yml', import.meta.url).pathname);
const q = queueConfig(YAML.parse(fs.readFileSync(ROOTCFG, 'utf8')));
const authors = authorsFrom(['feat\n\nAgent: builder-1\nAgent-Family: claude'], ['t@t']);
const V = (o = {}) => ({ patch_id: 'p1', sha: 'a'.repeat(40), result: 'PASS', by: 'verifier-1', family: 'gpt', provider: 'openai', at: '2026-10-24T01:00:00Z', ...o });

test('gate: an independent PASS for this exact patch-id is required; author verdicts and other patches do not count', () => {
  let d = gateDecision({ patchId: 'p1', files: ['docs/a.md'], verdicts: [], authors, q });
  assert.equal(d.pass, false); assert.equal(d.need, 'verdict');
  d = gateDecision({ patchId: 'p1', files: ['docs/a.md'], verdicts: [V({ by: 'builder-1' }), V({ family: 'claude', by: 'x' }), V({ patch_id: 'p0' })], authors, q });
  assert.equal(d.pass, false); assert.match(d.reasons.join(), /builder-1 \(gpt\) wrote or shares a family/);
  d = gateDecision({ patchId: 'p1', files: ['docs/a.md'], verdicts: [V()], authors, q });
  assert.equal(d.pass, true, d.reasons.join());
  d = gateDecision({ patchId: 'p1', files: ['docs/a.md'], verdicts: [V(), V({ by: 'verifier-2', result: 'FAIL', at: '2026-10-24T02:00:00Z' })], authors, q });
  assert.equal(d.pass, false); assert.match(d.reasons[0], /latest independent verdict is FAIL by verifier-2/);
  d = gateDecision({ patchId: 'p1', files: ['docs/a.md'], verdicts: [V({ result: 'FAIL' }), V({ at: '2026-10-24T02:00:00Z' })], authors, q });
  assert.equal(d.pass, true, 'a later PASS after a fix round counts');
});

test('gate: gate, auth and billing paths need a second PASS from a different provider', () => {
  for (const f of ['.github/workflows/ci.yml', 'bin/eng.mjs', 'eng.config.yml', 'src/auth/login.ts', 'app/billing/plan.ts', 'lib/merge-queue.mjs']) {
    const one = gateDecision({ patchId: 'p1', files: [f], verdicts: [V(), V({ by: 'verifier-3' })], authors, q });
    assert.equal(one.pass, false, f); assert.equal(one.need, 'second-provider');
  }
  const two = gateDecision({ patchId: 'p1', files: ['bin/eng.mjs'], verdicts: [V(), V({ by: 'gemini-1', family: 'gemini', provider: 'google' })], authors, q });
  assert.equal(two.pass, true, two.reasons.join()); assert.match(two.reasons.at(-1), /openai \+ google/);
  const sameAsAuthor = gateDecision({ patchId: 'p1', files: ['bin/eng.mjs'], verdicts: [V(), V({ by: 'claude-2', family: 'claude', provider: 'anthropic' })], authors, q });
  assert.equal(sameAsAuthor.pass, false, 'the second verifier must also be independent of the authors');
});

test('gate: an auto-revert passes only as the exact inverse of a commit on the base', () => {
  assert.equal(gateDecision({ patchId: 'r', files: ['bin/eng.mjs'], verdicts: [], authors, q, revert: { of: 'b'.repeat(40), matches: true } }).pass, true);
  assert.equal(gateDecision({ patchId: 'r', files: ['bin/eng.mjs'], verdicts: [], authors, q, revert: { of: 'b'.repeat(40), matches: false } }).pass, false);
});

test('verdict comments round-trip; other comments and broken JSON are ignored', () => {
  const vs = parseVerdicts([{ body: 'lgtm' }, { body: verdictBody(V({ at: '2026-10-24T03:00:00Z', by: 'late' })) }, { body: verdictBody(V()) }, { body: '<!-- eng-verdict/v1 -->\n```json\n{bad\n```' }]);
  assert.deepEqual(vs.map(v => v.by), ['verifier-1', 'late'], 'sorted by time');
  assert.equal(authors.providers.has('anthropic'), true);
  assert.equal(groupPr('refs/heads/gh-readonly-queue/main/pr-19-4cc0857a09db6aac19544f78a23889c0542d0fff'), 19);
  assert.equal(groupPr('refs/heads/main'), null);
  assert.equal(ownerOf('Owner: mcp:abc\nbody', authors), 'mcp:abc'); assert.equal(ownerOf('', authors), 'builder-1');
});

test('stuck: red or missing required check with no activity for 30 minutes', () => {
  const now = Date.parse('2026-10-24T02:00:00Z'), at = m => new Date(now - m * 60e3).toISOString();
  assert.equal(stuckDecision({ check: null, lastActivity: at(31), now, minutes: 30 }).stuck, true);
  assert.equal(stuckDecision({ check: { status: 'completed', conclusion: 'failure' }, lastActivity: at(45), now, minutes: 30 }).stuck, true);
  assert.equal(stuckDecision({ check: { status: 'completed', conclusion: 'failure' }, lastActivity: at(10), now, minutes: 30 }).stuck, false);
  assert.equal(stuckDecision({ check: { status: 'in_progress' }, lastActivity: at(90), now, minutes: 30 }).stuck, false, 'running is not stuck');
  assert.equal(stuckDecision({ check: { status: 'completed', conclusion: 'success' }, lastActivity: at(90), now, minutes: 30 }).stuck, false);
});

test('restart: a FAIL restarts the owner at once, a missing verdict after the wait, each cause once', () => {
  const now = Date.parse('2026-10-24T02:00:00Z'), base = { authors, patchId: 'p1', head: 'h'.repeat(40), now, waitMinutes: 30 };
  let r = restartDecision({ ...base, verdicts: [V({ result: 'FAIL', evidence: 'nd7x' })], headAt: new Date(now).toISOString() });
  assert.equal(r.restart, true); assert.match(r.reason, /verdict FAIL by verifier-1.*evidence nd7x/);
  assert.equal(restartDecision({ ...base, verdicts: [V({ result: 'FAIL' })], headAt: new Date(now).toISOString(), done: new Set([r.key]) }).restart, false);
  assert.equal(restartDecision({ ...base, verdicts: [], headAt: new Date(now - 10 * 60e3).toISOString() }).restart, false);
  r = restartDecision({ ...base, verdicts: [], headAt: new Date(now - 31 * 60e3).toISOString() });
  assert.equal(r.restart, true); assert.match(r.reason, /no verdict 31 min/);
  assert.equal(restartDecision({ ...base, verdicts: [V()], headAt: new Date(now - 99 * 60e3).toISOString() }).restart, false);
  assert.equal(restartDecision({ ...base, verdicts: [V({ by: 'builder-1', result: 'FAIL' })], headAt: new Date(now).toISOString() }).restart, false, 'an author FAIL is not a verdict');
});

test('config: one merge.queue block; it must name second-provider paths and use squash', () => {
  assert.deepEqual(validateQueue(YAML.parse(fs.readFileSync(ROOTCFG, 'utf8')).merge), []);
  assert.match(validateQueue({ method: 'merge', queue: { second_provider_paths: [] } }).join(), /squash.*second_provider_paths/);
  assert.equal(q.check, 'test'); assert.equal(q.base, 'main');
});

// ---------- CLI against a fake gh: responses are files under .gh/ keyed by API path ----------
let dir, ghd, calls;
const git = c => execSync(`git ${c}`, { cwd: dir, stdio: 'pipe', encoding: 'utf8' }).trim();
const pidOf = range => execSync(`git diff --binary ${range} | git patch-id --stable`, { cwd: dir, encoding: 'utf8' }).split(' ')[0];
const put = (k, v) => fs.writeFileSync(path.join(ghd, k.replace(/[^a-z0-9]+/gi, '_')), JSON.stringify(v));
const eng = (args, extra = {}) => spawnSync(process.execPath, [ENG, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${path.join(dir, '.bin')}:${process.env.PATH}`, GH_DIR: ghd, GH_CALLS: calls, GITHUB_REPOSITORY: 'o/r', GITHUB_EVENT_PATH: '', GITHUB_STEP_SUMMARY: '', ENG_RESTART_WEBHOOK: '', ...extra } });
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
  git('init -q -b main'); git('config user.email t@t'); git('config user.name t');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.bin/\n.gh/\n.gh-calls\n');
  fs.copyFileSync(ROOTCFG, path.join(dir, 'eng.config.yml'));
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
  git('add -A'); git('commit -qm base'); git('update-ref refs/remotes/origin/main HEAD');
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

function prWith(file) {
  git('checkout -q -B feat origin/main'); fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), `change ${file}\n`);
  git('add -A'); git(`commit -qm "change ${file}" -m "Agent: builder-1\nAgent-Family: claude"`);
  const head = git('rev-parse HEAD'), patch = pidOf(`origin/main ${head}`);
  git('checkout -q --detach origin/main'); git('merge -q --squash feat'); git('commit -qm "group"');
  const group = git('rev-parse HEAD');
  const ev = path.join(dir, '.gh/event.json'); fs.writeFileSync(ev, JSON.stringify({ merge_group: { head_sha: group, base_sha: git('rev-parse origin/main'), head_ref: `refs/heads/gh-readonly-queue/main/pr-7-${head}` } }));
  put('repos/o/r/pulls/7', { number: 7, labels: [], body: '', head: { sha: head } });
  put('repos/o/r/pulls/7/commits?per_page=100', [[{ commit: { message: `change ${file}\n\nAgent: builder-1\nAgent-Family: claude`, author: { email: 't@t' } } }]]);
  return { head, patch, group, ev };
}
const comments = vs => put('repos/o/r/issues/7/comments?per_page=100', [vs.map((v, i) => ({ body: verdictBody(v), created_at: `2026-10-24T0${i}:00:00Z` }))]);

test('eng merge gate on merge_group: binds the queued patch-id; gate files need a second provider', () => {
  let pr = prWith('docs/guide.md');
  comments([]);
  let r = eng(['merge', 'gate'], { GITHUB_EVENT_PATH: pr.ev });
  assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stdout, /test: FAIL for merge_group .* \(PR #7\)/); assert.match(r.stdout, /no independent verdict/);
  assert.equal(pidOf(`${pr.group}^ ${pr.group}`), pr.patch, 'the squashed queue commit has the PR patch-id');
  comments([V({ patch_id: pr.patch, sha: pr.head })]);
  r = eng(['merge', 'gate'], { GITHUB_EVENT_PATH: pr.ev });
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /test: PASS/);
  pr = prWith('bin/tool.mjs');
  comments([V({ patch_id: pr.patch, sha: pr.head })]);
  r = eng(['merge', 'gate'], { GITHUB_EVENT_PATH: pr.ev });
  assert.equal(r.status, 1); assert.match(r.stdout, /second PASS from a verifier on a different provider/);
  comments([V({ patch_id: pr.patch, sha: pr.head }), V({ patch_id: pr.patch, sha: pr.head, by: 'gemini-1', family: 'gemini', provider: 'google' })]);
  r = eng(['merge', 'gate'], { GITHUB_EVENT_PATH: pr.ev });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  comments([V({ patch_id: 'stale', sha: pr.head }), V({ patch_id: 'stale', sha: pr.head, by: 'gemini-1', family: 'gemini', provider: 'google' })]);
  assert.equal(eng(['merge', 'gate'], { GITHUB_EVENT_PATH: pr.ev }).status, 1, 'a verdict for another patch never carries');
});

test('eng merge gate: an auto-revert PR passes only when it is the exact inverse of the named commit', () => {
  git('checkout -q --detach origin/main'); fs.writeFileSync(path.join(dir, 'bad.txt'), 'bad\n'); git('add -A'); git('commit -qm bad');
  const bad = git('rev-parse HEAD'); git('update-ref refs/remotes/origin/main HEAD');
  git('checkout -q -B auto-revert origin/main'); git('revert --no-edit HEAD'); const head = git('rev-parse HEAD');
  const ev = path.join(dir, '.gh/event.json'); fs.writeFileSync(ev, JSON.stringify({ pull_request: { number: 7, head: { sha: head } } }));
  put('repos/o/r/pulls/7', { number: 7, labels: [{ name: 'auto-revert' }], body: `<!-- eng-auto-revert of=${bad} -->` });
  comments([]);
  let r = eng(['merge', 'gate'], { GITHUB_EVENT_PATH: ev });
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /exact inverse/);
  put('repos/o/r/pulls/7', { number: 7, labels: [{ name: 'auto-revert' }], body: `<!-- eng-auto-revert of=${git('rev-parse origin/main~1')} -->` });
  r = eng(['merge', 'gate'], { GITHUB_EVENT_PATH: ev });
  assert.equal(r.status, 1); assert.match(r.stdout, /not the exact inverse/);
});

test('eng merge watch --dry-run: flags a stuck PR and restarts the owner on a FAIL', () => {
  git('checkout -q -B feat2 origin/main'); fs.writeFileSync(path.join(dir, 'w.md'), 'w\n'); git('add -A'); git('commit -qm w -m "Agent: builder-9\nAgent-Family: claude"');
  const head = git('rev-parse HEAD'), patch = pidOf(`origin/main ${head}`), old = new Date(Date.now() - 45 * 60e3).toISOString();
  put('repos/o/r/pulls?state=open&base=main&per_page=100', [[{ number: 8, draft: false, head: { sha: head }, labels: [], updated_at: old, body: 'Owner: mcp:owner-thread', html_url: 'https://x/8' }]]);
  put('repos/o/r/pulls/8/commits?per_page=100', [[{ commit: { message: 'w\n\nAgent: builder-9\nAgent-Family: claude', author: { email: 't@t' }, committer: { date: old } } }]]);
  put('repos/o/r/issues/8/comments?per_page=100', [[{ body: verdictBody(V({ patch_id: patch, sha: head, result: 'FAIL', evidence: 'nd7e' })), created_at: old }]]);
  put(`repos/o/r/commits/${head}/check-runs?check_name=test&filter=latest`, { check_runs: [{ status: 'completed', conclusion: 'failure', completed_at: old }] });
  const r = eng(['merge', 'watch', '--dry-run']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /#8 [0-9a-f]{8}: STUCK \(required check failure on head, no activity for 4\d min\)/);
  assert.match(r.stdout, /#8: RESTART owner mcp:owner-thread: verdict FAIL by verifier-1/);
  assert.doesNotMatch(fs.readFileSync(calls, 'utf8'), /-X POST/, 'dry run posts nothing');
});

test('eng merge post --dry-run: a failing post-merge check would open an auto-revert; a passing one does nothing', () => {
  git('checkout -q --detach origin/main');
  const p = path.join(dir, 'eng.config.yml'), cfg = fs.readFileSync(p, 'utf8');
  fs.writeFileSync(p, cfg.replace('post_merge: { check: "bash scripts/shipped-artifact-check.sh" }', 'post_merge: { check: "true" }'));
  let r = eng(['merge', 'post', '--dry-run']); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /PASS on/);
  fs.writeFileSync(p, cfg.replace('post_merge: { check: "bash scripts/shipped-artifact-check.sh" }', 'post_merge: { check: "exit 4" }'));
  r = eng(['merge', 'post', '--dry-run']); assert.equal(r.status, 1); assert.match(r.stdout, /would open an auto-revert PR from auto-revert\//);
  fs.writeFileSync(p, cfg);
});

test('eng verdict --pr: records the verdict, posts it as a PR comment and posts the verdict status', () => {
  git('checkout -q -B feat3 origin/main'); fs.writeFileSync(path.join(dir, 'v.md'), 'v\n'); git('add -A'); git('commit -qm v -m "Agent: builder-1\nAgent-Family: claude"');
  fs.writeFileSync(calls, '');
  const r = eng(['verdict', 'PASS', '--by', 'verifier-1', '--family', 'gpt', '--provider', 'openai', '--pr', '7']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const log = fs.readFileSync(calls, 'utf8');
  assert.match(log, /api -X POST repos\/o\/r\/issues\/7\/comments --input -/);
  assert.match(log, new RegExp(`statuses/${git('rev-parse HEAD')} -f state=success -f context=verdict`));
  assert.match(r.stdout, /posted the verdict comment on PR #7/);
});
