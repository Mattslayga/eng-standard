import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';
import { decide, classify, resolvePolicy, validatePolicy, glob2re } from '../lib/e2e-policy.mjs';
import os from 'node:os';
import path from 'node:path';
// eng's scratch root and shared caches live under XDG_CACHE_HOME: keep them inside this run, never in the real ~/.cache.
process.env.XDG_CACHE_HOME = fs.mkdtempSync(path.join(process.env.ENG_TMP ?? os.tmpdir(), 'eng-xdg-'));
process.on('exit', () => fs.rmSync(process.env.XDG_CACHE_HOME, { recursive: true, force: true }));

const tpl = YAML.parse(fs.readFileSync(new URL('../templates/eng.config.yml', import.meta.url), 'utf8')).e2e;
const pr = (files, labels = []) => decide(tpl, { files, labels, event: 'pr' });

test('glob2re', () => {
  assert.ok(glob2re('**/*.md').test('README.md'));
  assert.ok(glob2re('**/*.md').test('docs/a/b.md'));
  assert.ok(glob2re('src/**').test('src/a/b.ts'));
  assert.ok(!glob2re('src/**').test('xsrc/a.ts'));
  assert.ok(glob2re('**/schema.*').test('convex/schema.ts'));
});

test('app code, routes, schema and migrations require e2e', () => {
  for (const [f, cat] of [['src/cart.ts', 'app'], ['convex/orders.ts', 'app'], ['web/routes/home.tsx', 'routes'], ['server/api/orders.ts', 'routes'],
    ['migrations/0003_add.sql', 'db'], ['convex/schema.ts', 'app'], ['db/schema.prisma', 'db'], ['package.json', 'build'], ['.github/workflows/ci.yml', 'ci'], ['eng.config.yml', 'ci'], ['tests/checkout.e2e.ts', 'e2e']]) {
    const d = pr([f]);
    assert.equal(d.required, true, f);
    assert.equal(d.files[0].cat, cat, f);
  }
});

test('docs-only, config-only (non-CI) and test-only skip e2e', () => {
  assert.equal(pr(['README.md', 'docs/guide.md']).required, false);
  assert.equal(pr(['.oxlintrc.json', 'tools/x.yml', '.gitignore', '.fallowrc.json']).required, false);
  assert.equal(pr(['src/cart.test.ts', 'tests/unit/a.ts', '.eng/checks/foo.sh']).required, false);
  assert.equal(pr(['README.md', 'src/cart.test.ts', '.oxlintrc.json']).required, false);
  assert.match(pr(['README.md']).reason, /only docs/);
});

test('one app file in a docs PR makes e2e required', () => {
  const d = pr(['README.md', 'src/cart.ts']);
  assert.equal(d.required, true);
  assert.match(d.reason, /app/);
});

test('risk:high label forces e2e', () => {
  assert.equal(pr(['README.md'], ['risk:high']).required, true);
  assert.equal(pr(['README.md'], ['other']).required, false);
});

test('unmatched files run by default, skip only if configured', () => {
  assert.equal(pr(['scripts/deploy.sh']).required, true);
  assert.equal(decide({ policy: { unmatched: 'skip' } }, { files: ['scripts/deploy.sh'] }).required, false);
});

test('main and nightly always run full e2e', () => {
  assert.equal(decide(tpl, { files: ['README.md'], event: 'main' }).required, true);
  assert.equal(decide(tpl, { event: 'nightly' }).required, true);
});

test('no policy section keeps the old always-run behaviour', () => {
  assert.equal(decide({ provider: 'e2e' }, { files: ['README.md'] }).required, true);
  assert.equal(decide({ policy: { mode: 'always' } }, { files: ['README.md'] }).required, true);
});

test('per-repo override replaces one list and keeps the other defaults', () => {
  const e = { policy: { run_on: { app: ['web/**'] } } };
  assert.equal(decide(e, { files: ['web/x.ts'] }).required, true);
  assert.equal(classify(resolvePolicy(e), 'migrations/1.sql').cat, 'db');
});

test('template equals the built-in defaults', () => {
  const r = resolvePolicy(tpl), d = resolvePolicy({ policy: {} });
  assert.deepEqual(r, d);
});

test('validation', () => {
  assert.deepEqual(validatePolicy(tpl), []);
  assert.equal(validatePolicy({ policy: { mode: 'sometimes' } }).length, 1);
  assert.equal(validatePolicy({ policy: { main: { on_merge: 'off' } } }).length, 1);
  assert.equal(validatePolicy({ policy: { run_on: { app: 'src/**' } } }).length, 1);
});
