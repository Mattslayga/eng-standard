// Disk hygiene: per-run temp dirs (ENG_TMP) and eng clean. The devbox disk hit 92% (13 Oct 2026): test runs left per-run
// /tmp dirs behind (Motus vitest/e2e 2-4 GB each, 44 GB; Core Edge fallow-coverage/cli-home ~8 GB; a stray 34 GB /tmp/node_modules)
// and 118 T3 worktrees (~70 GB) were never removed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'repo';
// Base for eng temp dirs: the real system temp, even when TMPDIR already points inside an ENG_TMP.
export const tmpBase = () => process.env.ENG_TMP_BASE || os.tmpdir();
export const PREFIX = repo => `eng-${slug(repo)}-`;

// Create $ENG_TMP=<tmp>/eng-<repo>-<runid> and remove it on exit, failure or signal (the trap). A child that inherits
// ENG_TMP from a parent eng reuses it and leaves removal to the owner. Returns env to pass to every child process.
export function engTmp(repo, { onSignalExit = code => process.exit(code) } = {}) {
  if (process.env.ENG_TMP && fs.existsSync(process.env.ENG_TMP)) return { dir: process.env.ENG_TMP, owned: false, env: { ...process.env } };
  const base = tmpBase();
  const dir = fs.mkdtempSync(path.join(base, `${PREFIX(repo)}${Date.now().toString(36)}-${process.pid}-`));
  const rm = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} };
  process.on('exit', rm);
  for (const [s, n] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) process.on(s, () => { rm(); onSignalExit(128 + n); });
  const env = { ...process.env, ENG_TMP: dir, ENG_TMP_BASE: base, TMPDIR: dir, TMP: dir, TEMP: dir };
  return { dir, owned: true, env, rm };
}

// Stale eng temp dirs for this repo: older than `hours`, and not owned by a live process (pid in the name).
export function staleTmpDirs(repo, hours, { base = tmpBase(), now = Date.now(), alive = pidAlive } = {}) {
  const pre = PREFIX(repo), out = [];
  let names = []; try { names = fs.readdirSync(base); } catch { return out; }
  for (const n of names.filter(n => n.startsWith(pre))) {
    const p = path.join(base, n); let st; try { st = fs.lstatSync(p); } catch { continue; }
    if (!st.isDirectory()) continue;
    const ageH = (now - st.mtimeMs) / 3600e3, pid = Number(n.slice(pre.length).split('-')[1]);
    out.push({ path: p, ageH, stale: ageH >= hours && !(pid && alive(pid)), why: ageH < hours ? `younger than ${hours}h` : pid && alive(pid) ? `pid ${pid} still running` : '' });
  }
  return out;
}
export function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

// Worktrees: removable only when (merged into the base OR its upstream branch is gone) AND every commit is on a remote AND clean.
export function parseWorktrees(porcelain) {
  return porcelain.split('\n\n').map(b => b.trim()).filter(Boolean).map(b => {
    const w = {}; for (const l of b.split('\n')) { const [k, ...v] = l.split(' '); w[k] = v.join(' ') || true; }
    return { path: w.worktree, head: w.HEAD, branch: typeof w.branch === 'string' ? w.branch.replace(/^refs\/heads\//, '') : null, bare: !!w.bare, locked: w.locked !== undefined, prunable: w.prunable !== undefined };
  });
}
export function classifyWorktree(w, { git, base, mainPath, cwdTop }) {
  if (w.path === mainPath || w.bare) return { keep: true, skip: true, why: 'main worktree' };
  if (w.prunable) return { keep: false, prune: true, why: 'directory is gone (git worktree prune)' };
  if (w.locked) return { keep: true, why: 'locked' };
  if (path.resolve(w.path) === cwdTop) return { keep: true, why: 'current worktree (run eng clean from the main checkout)' };
  const g = (...a) => git(['-C', w.path, ...a]);
  const st = g('status', '--porcelain', '--untracked-files=normal');
  if (st.status !== 0) return { keep: true, why: `git status failed: ${st.stderr.trim()}` };
  if (st.stdout.trim()) return { keep: true, report: true, why: `DIRTY: ${st.stdout.trim().split('\n').length} uncommitted change(s)` };
  // Squash merges leave the branch commits off every remote once the branch is deleted; count the work as on the remote
  // when merging HEAD into the base changes nothing (its content is already in the base).
  const mt = g('merge-tree', '--write-tree', base, 'HEAD'), baseTree = g('rev-parse', `${base}^{tree}`).stdout.trim();
  const inBase = mt.status === 0 && mt.stdout.split('\n')[0].trim() === baseTree;
  const unpushed = g('rev-list', '--count', 'HEAD', '--not', '--remotes');
  if (unpushed.status !== 0) return { keep: true, why: 'cannot compare with remotes' };
  if (Number(unpushed.stdout.trim()) > 0 && !inBase) return { keep: true, report: true, why: `UNPUSHED: ${unpushed.stdout.trim()} commit(s) not on any remote` };
  const merged = inBase || g('merge-base', '--is-ancestor', 'HEAD', base).status === 0;
  let gone = false;
  if (w.branch) {
    const upRef = g('for-each-ref', '--format=%(upstream)', `refs/heads/${w.branch}`).stdout.trim();
    gone = !!upRef && g('rev-parse', '--verify', '--quiet', upRef).status !== 0;
  }
  const tip = g('rev-parse', 'HEAD').stdout.trim(), baseTip = g('rev-parse', base).stdout.trim();
  if (tip === baseTip && !gone) return { keep: true, why: `no commits beyond ${base} yet (thread may still be starting)` };
  if (!merged && !gone) return { keep: true, why: `branch ${w.branch ?? '(detached)'} not merged into ${base} and still live upstream` };
  return { keep: false, why: `${merged ? `merged into ${base}${inBase ? ' (content)' : ''}` : 'upstream branch deleted'}, all commits on remote, clean` };
}

// Test code that writes to the system temp without the helper. Line-based, so a line that names ENG_TMP / engTmp passes.
export const TMP_RULE = {
  id: 'test-bare-tmpdir',
  paths: ['**/*.test.*', '**/*.spec.*', '**/*.e2e.*', '**/__tests__/**', 'test/**', 'tests/**', 'e2e/**', '**/vitest.config.*', '**/vitest.*.config.*', '**/e2e.config.*', '**/playwright.config.*'],
  pattern: '^(?!.*\\b(ENG_TMP|engTmp)\\b).*(\\btmpdir\\(\\)|[\'"`]/tmp(/|[\'"`]))',
  flags: '',
  message: 'Test writes to the system temp dir. Use process.env.ENG_TMP (per-run dir, removed on exit by eng gate/e2e), e.g. fs.mkdtempSync(path.join(process.env.ENG_TMP ?? os.tmpdir(), "x-")), or .eng/test-tmp.mjs (vitest globalSetup).',
};
