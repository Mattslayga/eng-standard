import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { engTmp } from '../lib/hygiene.mjs';

const ENG = path.resolve(new URL('../bin/eng.mjs', import.meta.url).pathname);
const TPL = path.resolve(new URL('../templates/eng.config.yml', import.meta.url).pathname);
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
