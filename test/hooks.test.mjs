import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { claudeSettings, hooks } from '../lib/render.mjs';

const ENG = path.resolve(new URL('../bin/eng.mjs', import.meta.url).pathname);
const TPL = path.resolve(new URL('../templates/eng.config.yml', import.meta.url).pathname);
const cfg = (extra = {}) => ({ project: { default_branch: 'main', protected_branches: ['main'] }, agents: { harnesses: ['claude-code'] }, ...extra });

test('pre-commit runs hooks.pre_commit commands after the eng checks', () => {
  const line = hooks(cfg({ hooks: { pre_commit: ['bun run lint:staged', 'bun run typecheck'] } }))['.githooks/pre-commit'].trim().split('\n').at(-1);
  assert.equal(line, '$ENG drift-check && $ENG stack-check && $ENG lint && bun run lint:staged && bun run typecheck');
});

test('unset hook keys render the same pre-commit and Claude settings as before', () => {
  assert.equal(hooks(cfg())['.githooks/pre-commit'].trim().split('\n').at(-1), '$ENG drift-check && $ENG stack-check && $ENG lint');
  assert.deepEqual(Object.keys(JSON.parse(claudeSettings(cfg()))), ['permissions']);
});

test('agents.post_edit_command renders a Claude Code PostToolUse hook next to the deny list', () => {
  const settings = JSON.parse(claudeSettings(cfg({ agents: { harnesses: ['claude-code'], post_edit_command: 'node scripts/lint-changed.mjs --hook' } })));
  assert.ok(settings.permissions.deny.includes('Bash(gh pr merge --admin:*)'));
  assert.deepEqual(settings.hooks, {
    PostToolUse: [{ matcher: 'Edit|MultiEdit|Write', hooks: [{ type: 'command', command: 'node scripts/lint-changed.mjs --hook', timeout: 60 }] }],
  });
});

test('config validation rejects malformed hook keys', () => {
  const dir = fs.mkdtempSync(path.join(process.env.ENG_TMP ?? os.tmpdir(), 'eng-hooks-'));
  try {
    execSync('git init -q', { cwd: dir });
    const c = YAML.parse(fs.readFileSync(TPL, 'utf8'));
    c.hooks = { pre_commit: ['ok', ''] };
    c.agents.post_edit_command = 42;
    fs.writeFileSync(path.join(dir, 'eng.config.yml'), YAML.stringify(c));
    const r = spawnSync(process.execPath, [ENG, 'drift-check'], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /hooks\.pre_commit must be a list of non-empty commands/);
    assert.match(r.stderr + r.stdout, /agents\.post_edit_command must be a non-empty command/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
