#!/usr/bin/env node
// eng-standard's own merge automation (v0.8.0). Run by .github/workflows/risk-label.yml and self-merge.yml, always
// from main's code. Uses `gh api` with GH_TOKEN (the workflow's GITHUB_TOKEN). Rules: AGENTS.md "Merge rule".
//   node scripts/pr-gate.mjs label <n> [--dry-run]     set risk:high or risk:low from the PR's changed paths
//   node scripts/pr-gate.mjs merge [--pr <n>] [--dry-run]   squash-merge at most ONE eligible PR, then run ci.yml on main
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { classifyRisk, versionOnly } from '../lib/risk.mjs';
import { selfMergeConfig, decide } from '../lib/self-merge.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = YAML.parse(fs.readFileSync(path.join(ROOT, 'eng.config.yml'), 'utf8'));
const C = selfMergeConfig(cfg), HR = cfg.ship.high_risk;
const R = process.env.GITHUB_REPOSITORY || 'Mattslayga/eng-standard';
const [cmd, ...a] = process.argv.slice(2);
const dry = a.includes('--dry-run');
const opt = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };

function gh(args, input) {
  const r = spawnSync('gh', ['api', ...args], { encoding: 'utf8', input });
  if (r.status !== 0) { const e = new Error(`gh api ${args.join(' ')}: ${(r.stderr || r.stdout).trim()}`); e.out = r.stdout; throw e; }
  return r.stdout;
}
const get = p => JSON.parse(gh([p]) || 'null');
const send = (method, p, body) => gh(['-X', method, p, '--input', '-'], JSON.stringify(body ?? {}));
const raw = (file, sha) => { try { return gh(['-H', 'Accept: application/vnd.github.raw', `repos/${R}/contents/${encodeURIComponent(file).replaceAll('%2F', '/')}?ref=${sha}`]); } catch { return null; } };

function riskFor(pr) {
  const files = JSON.parse(gh(['--paginate', '--slurp', `repos/${R}/pulls/${pr.number}/files?per_page=100`])).flat();
  const bump = new Set((HR.version_only || []).filter(f => files.some(x => x.filename === f && x.status === 'modified'))
    .filter(f => versionOnly(f, raw(f, pr.base.sha), raw(f, pr.head.sha))));
  return classifyRisk(files, HR, bump);
}

function label(n) {
  const pr = get(`repos/${R}/pulls/${n}`);
  const { risk, hits } = riskFor(pr);
  const want = risk === 'high' ? C.high_label : C.low_label, drop = risk === 'high' ? C.low_label : C.high_label;
  console.log(`#${n} ${pr.head.sha.slice(0, 8)}: ${want}${hits.length ? '\n  ' + hits.map(h => `${h.file}  (${h.pattern})`).join('\n  ') : ' (no high-risk path changed)'}`);
  if (dry) return;
  send('POST', `repos/${R}/issues/${n}/labels`, { labels: [want] });
  if (pr.labels.some(l => l.name === drop)) gh(['-X', 'DELETE', `repos/${R}/issues/${n}/labels/${encodeURIComponent(drop)}`]);
}

function prState(pr) {
  const sha = pr.head.sha;
  const runs = get(`repos/${R}/commits/${sha}/check-runs?check_name=${encodeURIComponent(C.check)}&filter=latest&per_page=100`).check_runs
    .filter(r => r.app?.slug === 'github-actions').sort((x, y) => (y.started_at || '').localeCompare(x.started_at || ''));
  const st = get(`repos/${R}/commits/${sha}/status`).statuses.find(s => s.context === C.status) || null;
  return { risk: riskFor(pr).risk, check: runs[0] || null, status: st };
}

function merge() {
  // Stop the line: never merge onto a red or untested main. A GITHUB_TOKEN merge fires no push workflow, so a main
  // tip with no `test` run gets ci.yml dispatched here and is retried on the next run.
  const tip = get(`repos/${R}/commits/${C.base}`).sha;
  const t = get(`repos/${R}/commits/${tip}/check-runs?check_name=${encodeURIComponent(C.check)}&filter=latest`).check_runs.filter(r => r.app?.slug === 'github-actions')[0];
  if (!t) { console.log(`main ${tip.slice(0, 8)}: no ${C.check} run yet; ${dry ? 'would dispatch' : 'dispatching'} ci.yml, merging nothing this run`); if (!dry) send('POST', `repos/${R}/actions/workflows/ci.yml/dispatches`, { ref: C.base }); return; }
  if (t.status !== 'completed') return console.log(`main ${tip.slice(0, 8)}: ${C.check} still running; merging nothing this run`);
  if (t.conclusion !== 'success') return console.log(`main ${tip.slice(0, 8)}: ${C.check} is ${t.conclusion}. Main is red: revert the last merge (gh pr revert <n>); merging nothing`);
  const only = opt('--pr') || process.env.PR || '';
  const prs = (only ? [get(`repos/${R}/pulls/${only}`)] : JSON.parse(gh(['--paginate', '--slurp', `repos/${R}/pulls?state=open&base=${C.base}&per_page=100`])).flat())
    .filter(p => p.state === 'open').sort((x, y) => x.created_at.localeCompare(y.created_at));
  for (const p of prs) {
    const pr = { number: p.number, base: p.base.ref, draft: p.draft, sameRepo: p.head.repo?.full_name === R, headSha: p.head.sha, labels: p.labels.map(l => l.name) };
    let d;
    try { d = pr.base === C.base && pr.sameRepo ? decide(pr, prState(p), C) : decide(pr, {}, C); } catch (e) { d = { merge: false, reason: `could not read state: ${e.message.split('\n')[0]}` }; }
    console.log(`#${p.number} ${p.head.sha.slice(0, 8)}: ${d.merge ? (dry ? 'WOULD MERGE' : 'MERGE') : 'skip'}: ${d.reason}`);
    if (!d.merge || dry) continue;
    if (get(`repos/${R}/issues/${p.number}/labels`).some(l => l.name === C.hold_label)) { console.log(`#${p.number}: ${C.hold_label} added just now; skip`); continue; }
    try {
      send('PUT', `repos/${R}/pulls/${p.number}/merge`, { merge_method: 'squash', sha: p.head.sha, commit_title: `${p.title} (#${p.number})` });
    } catch (e) { console.log(`#${p.number}: merge refused: ${e.message.split('\n')[0]}`); continue; }
    console.log(`#${p.number}: squash-merged at head ${p.head.sha}. Undo: gh pr revert ${p.number}`);
    // Delete the merged branch (fixed rule 18); GitHub then retargets PRs stacked on it to main.
    try { gh(['-X', 'DELETE', `repos/${R}/git/refs/heads/${p.head.ref}`]); } catch (e) { console.log(`  branch ${p.head.ref} not deleted: ${e.message.split('\n')[0]}`); }
    send('POST', `repos/${R}/actions/workflows/ci.yml/dispatches`, { ref: C.base });
    return console.log(`  dispatched ci.yml on ${C.base} (post-merge backstop). One merge per run.`);
  }
}

if (cmd === 'label' && a[0]) label(a[0]);
else if (cmd === 'merge') merge();
else { console.error('usage: pr-gate.mjs label <n> [--dry-run] | merge [--pr <n>] [--dry-run]'); process.exit(1); }
