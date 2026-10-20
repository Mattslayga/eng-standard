import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { engTmp } from '../lib/hygiene.mjs';

const ENG = path.resolve(new URL('../bin/eng.mjs', import.meta.url).pathname);
const TPL = path.resolve(new URL('../templates/eng.config.yml', import.meta.url).pathname);
const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const tmp = engTmp('lock-tests');
let dir;
const command = (bin, args) => spawnSync(bin, args, { cwd: dir, encoding: 'utf8', env: tmp.env });
const git = (...args) => {
  const r = command('git', args);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout.trim();
};
const eng = (...args) => command(process.execPath, [ENG, ...args]);
const sync = () => {
  const r = eng('sync');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout;
};
const read = p => fs.readFileSync(path.join(dir, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(dir, p), s);
const lock = () => JSON.parse(read('.eng/lock.json'));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(tmp.dir, 'consumer-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  fs.copyFileSync(TPL, path.join(dir, 'eng.config.yml'));
  fs.mkdirSync(path.join(dir, '.eng/checks'), { recursive: true });
  write('.eng/checks/mm-existing.sh', '#!/usr/bin/env bash\nexit 0\n');
  sync();
});

test('sync round-trips a sorted path list without content hashes', () => {
  const initial = read('.eng/lock.json');
  const saved = lock();
  assert.ok(Array.isArray(saved.files));
  assert.ok(saved.files.every(p => typeof p === 'string'));
  assert.deepEqual(saved.files, [...new Set(saved.files)].sort());
  assert.ok(saved.files.includes('AGENTS.md'));
  assert.ok(saved.files.includes('SHIPPING.md'));
  assert.deepEqual(Object.keys(saved).sort(), ['config_hash', 'files', 'links', 'package']);
  assert.equal(saved.package, VERSION);
  assert.match(saved.config_hash, /^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(saved.links));
  assert.match(sync(), /eng sync: no changes/);
  assert.equal(read('.eng/lock.json'), initial);
  const drift = eng('drift-check');
  assert.equal(drift.status, 0, drift.stdout + drift.stderr);
  write('SHIPPING.md', read('SHIPPING.md') + '\nhand edit\n');
  const edited = eng('drift-check');
  assert.equal(edited.status, 1, edited.stdout + edited.stderr);
  assert.match(edited.stderr, /SHIPPING\.md: differs from what eng\.config\.yml renders/);
});

test('sync migrates a legacy hash map and preserves config and link metadata', () => {
  const expected = lock();
  const paths = [...expected.files];
  write('.eng/lock.json', JSON.stringify({ ...expected, package: '0.8.3',
    files: Object.fromEntries(paths.reverse().map(p => [p, '0'.repeat(64)])) }));
  sync();
  assert.deepEqual(lock(), expected);
  assert.match(sync(), /eng sync: no changes/);
});

for (const format of ['path list', 'legacy hash map']) {
  test(`lint and pruning accept the ${format}`, () => {
    const saved = lock();
    const paths = [...saved.files, 'retired.test.mjs'];
    saved.files = format === 'path list' ? paths : Object.fromEntries(paths.map(p => [p, '0'.repeat(64)]));
    write('.eng/lock.json', JSON.stringify(saved));
    write('retired.test.mjs', 'const d = os.tmpdir();\n');
    write('0', 'unmanaged file\n');
    const clean = eng('lint');
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    write('own.test.mjs', 'const d = os.tmpdir();\n');
    const own = eng('lint');
    assert.equal(own.status, 1, own.stdout + own.stderr);
    assert.match(own.stderr, /own\.test\.mjs:1: \[test-bare-tmpdir\]/);
    assert.doesNotMatch(own.stderr, /retired\.test\.mjs/);
    sync();
    assert.equal(fs.existsSync(path.join(dir, 'retired.test.mjs')), false);
    assert.equal(read('0'), 'unmanaged file\n');
    assert.equal(read('own.test.mjs'), 'const d = os.tmpdir();\n');
    assert.ok(!lock().files.includes('retired.test.mjs'));
  });
}

test('Motus repro: unrelated check additions produce identical locks and merge cleanly', () => {
  git('add', '-A');
  git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  const baselineLock = read('.eng/lock.json');
  const baselineAgents = read('AGENTS.md');
  const heads = [];
  for (const id of ['aa-scratch', 'zz-scratch']) {
    git('checkout', '-qb', id, base);
    write(`.eng/checks/${id}.sh`, '#!/usr/bin/env bash\nexit 0\n');
    sync();
    assert.notEqual(read('AGENTS.md'), baselineAgents);
    git('add', '-A');
    git('commit', '-qm', `add ${id}`);
    heads.push(git('rev-parse', 'HEAD'));
  }
  const merged = command('git', ['merge-tree', '--write-tree', '--name-only', ...heads]);
  assert.equal(merged.status, 0, merged.stdout + merged.stderr);
  for (const head of heads) assert.equal(command('git', ['show', `${head}:.eng/lock.json`]).stdout, baselineLock);
  const tree = merged.stdout.trim();
  const commit = git('commit-tree', tree, '-p', heads[0], '-p', heads[1], '-m', 'merge checks');
  git('checkout', '-q', '--detach', commit);
  const drift = eng('drift-check');
  assert.equal(drift.status, 0, drift.stdout + drift.stderr);
  assert.match(read('AGENTS.md'), /aa-scratch/);
  assert.match(read('AGENTS.md'), /zz-scratch/);
});

test('drift-check ignores legacy hashes and catches hand-edited generated content', () => {
  const legacy = lock();
  const paths = Array.isArray(legacy.files) ? legacy.files : Object.keys(legacy.files);
  legacy.files = Object.fromEntries(paths.map(p => [p, '0'.repeat(64)]));
  write('.eng/lock.json', JSON.stringify(legacy));
  const clean = eng('drift-check');
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  write('SHIPPING.md', read('SHIPPING.md') + '\nhand edit\n');
  const drift = eng('drift-check');
  assert.equal(drift.status, 1, drift.stdout + drift.stderr);
  assert.match(drift.stderr, /SHIPPING\.md: differs from what eng\.config\.yml renders/);
});
