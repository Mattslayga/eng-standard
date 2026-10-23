// eng-standard's own merge rule (v0.8.0): risk paths, the self-merge decision, and `eng verdict status`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import YAML from 'yaml';
import { classifyRisk, versionOnly } from '../lib/risk.mjs';
import { selfMergeConfig, decide } from '../lib/self-merge.mjs';
// eng's scratch root and shared caches live under XDG_CACHE_HOME: keep them inside this run, never in the real ~/.cache.
process.env.XDG_CACHE_HOME = fs.mkdtempSync(path.join(process.env.ENG_TMP ?? os.tmpdir(), 'eng-xdg-'));
process.on('exit', () => fs.rmSync(process.env.XDG_CACHE_HOME, { recursive: true, force: true }));

const ROOTCFG = path.resolve(new URL('../eng.config.yml', import.meta.url).pathname);
const ENG = path.resolve(new URL('../bin/eng.mjs', import.meta.url).pathname);
const cfg = YAML.parse(fs.readFileSync(ROOTCFG, 'utf8'));
const HR = cfg.ship.high_risk, C = selfMergeConfig(cfg);
const mod = (...f) => f.map(filename => ({ filename, status: 'modified' }));

test('risk: docs and rendered-text PRs (#14 to #16 shape) are low, a version-only bump included', () => {
  const r = classifyRisk(mod('CHANGELOG.md', 'lib/render.mjs', 'package-lock.json', 'package.json', 'templates/SHIPPING.md', 'templates/eng.config.yml', 'test/hygiene.test.mjs'), HR, new Set(['package.json', 'package-lock.json']));
  assert.deepEqual(r, { risk: 'low', hits: [] });
});

test('risk: workflows, CI, merge setup, CLI, scripts, vendored code are high', () => {
  for (const f of ['.github/workflows/ci.yml', '.github/workflows/self-merge.yml', '.github/CODEOWNERS', 'eng.config.yml', 'AGENTS.md', 'docs/self-merge.md',
    'bin/eng.mjs', 'scripts/pr-gate.mjs', 'lib/risk.mjs', 'lib/self-merge.mjs', 'lib/e2e-policy.mjs', '.npmrc', 'vendor/PINS.txt', '.githooks/pre-commit'])
    assert.equal(classifyRisk(mod(f), HR).risk, 'high', f);
  assert.equal(classifyRisk(mod('templates/eng.config.yml', 'docs/modern-stack.md', 'skills/eng-verify/SKILL.md'), HR).risk, 'low');
});

test('risk: package.json is high unless the version is the only change; unknown or empty is high', () => {
  assert.equal(classifyRisk(mod('package.json'), HR).risk, 'high');                         // not shown to be a bump
  assert.equal(classifyRisk(mod('package.json'), HR, new Set(['package.json'])).risk, 'low');
  assert.equal(classifyRisk([{ filename: 'package.json', status: 'added' }], HR, new Set(['package.json'])).risk, 'high');
  assert.equal(classifyRisk([], HR).risk, 'high');
  const pj = v => JSON.stringify({ name: 'x', version: v, scripts: { test: 'node --test test/' } });
  assert.equal(versionOnly('package.json', pj('0.7.0'), pj('0.8.0')), true);
  assert.equal(versionOnly('package.json', pj('0.7.0'), pj('0.8.0').replace('node --test test/', 'true')), false);
  const lock = v => JSON.stringify({ name: 'x', version: v, packages: { '': { name: 'x', version: v }, 'node_modules/yaml': { version: '2.9.1' } } });
  assert.equal(versionOnly('package-lock.json', lock('0.7.0'), lock('0.8.0')), true);
  assert.equal(versionOnly('package-lock.json', lock('0.7.0'), lock('0.8.0').replace('2.9.1', '2.9.2')), false);
  assert.equal(versionOnly('package.json', null, pj('1')), false);
});

test('risk: a rename out of a high-risk path is high', () => {
  assert.equal(classifyRisk([{ filename: 'docs/old.yml', previous_filename: '.github/workflows/ci.yml', status: 'renamed' }], HR).risk, 'high');
});

const SHA = 'a'.repeat(40), T0 = Date.parse('2026-10-19T05:00:00Z');
const pr = (o = {}) => ({ number: 1, base: 'main', draft: false, sameRepo: true, headSha: SHA, labels: ['risk:low'], ...o });
const st = (o = {}) => ({ risk: 'low', check: { head_sha: SHA, status: 'completed', conclusion: 'success', completed_at: '2026-10-19T05:00:00Z' }, status: { state: 'success', created_at: '2026-10-19T04:30:00Z' }, ...o });
const at = min => T0 + min * 60_000;

test('self-merge: default window is 2 hours from the later of test and verdict going green', () => {
  assert.equal(C.hold_minutes, 120);
  assert.equal(decide(pr(), st(), C, at(119)).merge, false);
  assert.match(decide(pr(), st(), C, at(119)).reason, /hold window/);
  assert.equal(decide(pr(), st(), C, at(120)).merge, true);
  const late = st({ status: { state: 'success', created_at: '2026-10-19T06:00:00Z' } });   // verdict after test
  assert.equal(decide(pr(), late, C, at(179)).merge, false);
  assert.equal(decide(pr(), late, C, at(180)).merge, true);
  assert.equal(decide(pr(), st(), { ...C, hold_minutes: 30 }, at(30)).merge, true);
  assert.throws(() => selfMergeConfig({ ship: { self_merge: { hold_minutes: -1 } } }));
});

test('self-merge: every rule must hold', () => {
  const late = at(600), no = (p, s) => decide(p, s, C, late);
  assert.equal(no(pr(), st()).merge, true);
  const cases = [
    [pr({ base: 'clean-up-on-merge' }), st(), /base is clean-up-on-merge/],
    [pr({ sameRepo: false }), st(), /fork/],
    [pr({ draft: true }), st(), /draft/],
    [pr({ labels: ['risk:low', 'hold'] }), st(), /hold label/],
    [pr({ labels: ['risk:low', 'risk:high'] }), st(), /Matt merges/],
    [pr({ labels: [] }), st(), /no risk:low label/],
    [pr(), st({ risk: 'high' }), /recomputed/],
    [pr(), st({ check: null }), /no test check/],
    [pr(), st({ check: { ...st().check, head_sha: 'b'.repeat(40) } }), /no test check on head/],
    [pr(), st({ check: { ...st().check, conclusion: 'failure' } }), /test is failure/],
    [pr(), st({ check: { ...st().check, status: 'in_progress', conclusion: null } }), /test is in_progress/],
    [pr(), st({ status: null }), /no verdict status/],
    [pr(), st({ status: { state: 'failure', created_at: '2026-10-19T04:30:00Z' } }), /verdict is failure/],
    [pr(), st({ status: { state: 'pending', created_at: '2026-10-19T04:30:00Z' } }), /verdict is pending/],
  ];
  for (const [p, s, re] of cases) { const d = no(p, s); assert.equal(d.merge, false, re.source); assert.match(d.reason, re); }
});

// eng verdict PASS --pr <n>: records the verdict, then posts commit status `verdict` on the exact head SHA.
let dir, fakebin, calls;
const git = c => execSync(`git ${c}`, { cwd: dir, stdio: 'pipe', encoding: 'utf8' });
const eng = (...a) => spawnSync(process.execPath, [ENG, ...a], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${fakebin}:${process.env.PATH}`, FAKE_HEAD: git('rev-parse HEAD').trim() } });
before(() => {
  dir = fs.mkdtempSync(path.join(process.env.ENG_TMP ?? os.tmpdir(), 'eng-selfmerge-'));
  fakebin = path.join(dir, '.fakebin'); calls = path.join(dir, '.gh-calls');
  fs.mkdirSync(fakebin);
  fs.writeFileSync(path.join(fakebin, 'gh'), `#!/usr/bin/env bash
if [[ "$1 $2" == "pr view" ]]; then echo "{\\"headRefOid\\":\\"$FAKE_HEAD\\",\\"state\\":\\"OPEN\\"}"; exit 0; fi
if [[ "$1" == "api" ]]; then printf '%s\\n' "$*" >> "${calls}"; echo '{}'; exit 0; fi
echo "fake-gh: unexpected: $*" >&2; exit 1
`, { mode: 0o755 });
  git('init -q -b main'); git('config user.email t@t'); git('config user.name t');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.fakebin/\n.gh-calls\n');
  fs.copyFileSync(ROOTCFG, path.join(dir, 'eng.config.yml'));
  git('add -A'); git('commit -qm base'); git('checkout -qb feat');
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n'); git('add -A');
  git('commit -qm docs -m "Agent: builder-1" -m "Agent-Family: fam-a"');
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('eng verdict --pr: author family is rejected and posts failure; independent PASS posts success on HEAD', () => {
  const H = git('rev-parse HEAD').trim();
  let r = eng('verdict', 'PASS', '--by', 'builder-1', '--family', 'fam-a', '--pr', '7');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(fs.readFileSync(calls, 'utf8'), new RegExp(`statuses/${H} -f state=failure -f context=verdict`));
  r = eng('verdict', 'PASS', '--by', 'checker-1', '--family', 'fam-b', '--pr', '7');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /posted success \(context verdict\)/);
  assert.match(fs.readFileSync(calls, 'utf8').trim().split('\n').at(-1), new RegExp(`statuses/${H} -f state=success -f context=verdict -f description=verdict: PASS \\(PASS by checker-1 \\(fam-b\\)`));
  r = eng('verdict', 'status');
  assert.equal(r.status, 1); assert.match(r.stderr, /usage: eng verdict status --pr <n>/);
});
