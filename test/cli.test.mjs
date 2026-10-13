import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';

const ENG = path.resolve(new URL('../bin/eng.mjs', import.meta.url).pathname);
const TPL = path.resolve(new URL('../templates/eng.config.yml', import.meta.url).pathname);
let dir;
const env = { ...process.env, ENG_PR_LABELS: '', BUILDKITE: '', GITHUB_ACTIONS: '', ENG_E2E_EVENT: '', GITHUB_BASE_REF: '', BUILDKITE_PULL_REQUEST_BASE_BRANCH: '', BUILDKITE_PULL_REQUEST_LABELS: '' };
const eng = (...a) => spawnSync(process.execPath, [ENG, ...a], { cwd: dir, encoding: 'utf8', env });
const git = c => execSync(`git ${c}`, { cwd: dir, stdio: 'pipe', encoding: 'utf8' });

before(() => {
  dir = fs.mkdtempSync(path.join(process.env.ENG_TMP ?? os.tmpdir(), 'eng-cli-'));
  git('init -q -b main'); git('config user.email t@t'); git('config user.name t');
  fs.copyFileSync(TPL, path.join(dir, 'eng.config.yml'));
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
  git('add -A'); git('commit -qm base'); git('checkout -qb feat');
});

after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('e2e-required: docs-only diff is not required, exit 10 with --exit-code', () => {
  fs.writeFileSync(path.join(dir, 'README.md'), 'y\n'); git('commit -qam docs');
  const r = eng('e2e-required', '--exit-code');
  assert.equal(r.status, 10, r.stdout + r.stderr);
  assert.match(r.stdout, /NOT REQUIRED \(only docs/);
});

test('e2e-required: app change is required; uncommitted files count', () => {
  fs.mkdirSync(path.join(dir, 'src')); fs.writeFileSync(path.join(dir, 'src/a.ts'), 'export {}\n');
  const r = eng('e2e-required', '--exit-code');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /REQUIRED \(touches app/);
  fs.rmSync(path.join(dir, 'src'), { recursive: true });
});

test('e2e-required: --files, --labels, --event, --json', () => {
  assert.equal(JSON.parse(eng('e2e-required', '--files', 'docs/a.md', '--json').stdout).required, false);
  assert.equal(JSON.parse(eng('e2e-required', '--files', 'docs/a.md', '--labels', 'risk:high', '--json').stdout).required, true);
  assert.equal(JSON.parse(eng('e2e-required', '--files', 'docs/a.md', '--event', 'main', '--json').stdout).required, true);
});

test('e2e --if-required passes as NOT REQUIRED on a docs-only diff', () => {
  const r = eng('e2e', '--if-required');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /eng e2e: NOT REQUIRED by e2e.policy/);
});

test('e2e --if-required on main still runs the real e2e (fails here: no pins)', () => {
  const r = eng('e2e', '--if-required', '--event', 'main');
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /e2e required: main after merge/);
});

test('invalid policy is rejected', () => {
  const p = path.join(dir, 'eng.config.yml'), s = fs.readFileSync(p, 'utf8');
  fs.writeFileSync(p, s.replace('on_merge: full', 'on_merge: off'));
  const r = eng('e2e-required');
  fs.writeFileSync(p, s);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /on_merge must be full/);
});

test('rendered pipeline, SHIPPING.md and AGENTS.md carry the policy; drift-check passes', () => {
  const s = eng('sync'); assert.equal(s.status, 0, s.stderr);
  const pipe = fs.readFileSync(path.join(dir, '.eng/ci/pipeline.yml'), 'utf8');
  assert.match(pipe, /npx eng e2e --if-required/);
  assert.match(pipe, /# e2e: PRs run it only when/);
  const ship = fs.readFileSync(path.join(dir, 'SHIPPING.md'), 'utf8');
  assert.match(ship, /E2E is path-based on PRs/);
  assert.match(ship, /red e2e on `main` means the shipping manager reverts/);
  assert.match(ship, /motus #285/);
  assert.match(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), /eng e2e-required/);
  assert.ok(!fs.existsSync(path.join(dir, '.eng/ci/e2e-nightly.yml')));
  assert.equal(eng('drift-check').status, 0);
});

test('nightly enabled renders the nightly pipeline', () => {
  const p = path.join(dir, 'eng.config.yml'), s = fs.readFileSync(p, 'utf8');
  fs.writeFileSync(p, s.replace('nightly: { enabled: false', 'nightly: { enabled: true'));
  assert.equal(eng('sync').status, 0);
  const n = fs.readFileSync(path.join(dir, '.eng/ci/e2e-nightly.yml'), 'utf8');
  assert.match(n, /ENG_E2E_EVENT: nightly/);
  assert.match(n, /cron "0 16 \* \* \*"/);
  fs.writeFileSync(p, s); eng('sync');
});

test('--help lists e2e-required', () => {
  const r = eng('--help'); assert.equal(r.status, 0); assert.match(r.stdout, /e2e-required/);
});
