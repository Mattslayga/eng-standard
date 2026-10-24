// Merge rule v0.10.0 (Matt, 24 Oct 2026, 10:31 AM AEDT): no PR needs a human merge, gate changes included. A PR merges through
// GitHub's merge queue with auto-merge, only when the ONE required check (eng merge gate) passes on merge_group: tests green on
// the queued commit AND an independent verifier's PASS for that exact patch-id. Gate, auth or billing paths also need a second
// PASS from a verifier on a different provider. A failed post-merge check opens an auto-revert. A FAIL or missing verdict
// restarts the owning job; red or missing checks with no activity for 30 minutes flag the PR as stuck.
// Pure: GitHub/git facts in, decisions out. bin/eng.mjs (eng merge gate|watch|post|settings) does the IO.
import { glob2re } from './e2e-policy.mjs';
import { FAMILY_PROVIDER } from './renovate.mjs';

export const VERDICT_MARK = '<!-- eng-verdict/v1 -->';
export const RESTART_MARK = '<!-- eng-restart/v1 ';
export const STUCK_MARK = '<!-- eng-stuck/v1 ';
export const PASSING = new Set(['PASS', 'PASS+NOTES']);

export const QUEUE_DEFAULTS = {
  base: 'main', check: 'eng-merge-gate', workflow: 'ci.yml', method: 'squash',
  second_provider_paths: [], post_merge: { check: 'npm test' }, stuck_minutes: 30, verdict_wait_minutes: 30,
  stuck_label: 'stuck', revert_label: 'auto-revert', restart_webhook_env: 'ENG_RESTART_WEBHOOK',
};
export function queueConfig(cfg) {
  const q = cfg?.merge?.queue;
  if (!q) return null;
  return { ...QUEUE_DEFAULTS, ...q, base: q.base || cfg.project?.default_branch || 'main', post_merge: { ...QUEUE_DEFAULTS.post_merge, ...q.post_merge } };
}
export function validateQueue(merge) {
  const q = merge?.queue; if (q === undefined) return [];
  const e = [];
  if (!q || typeof q !== 'object') return ['merge.queue must be a mapping'];
  if (merge.method && merge.method !== 'squash') e.push('merge.queue needs merge.method: squash (the verdict binds the squashed patch)');
  if (q.check !== undefined && !(typeof q.check === 'string' && q.check.trim())) e.push('merge.queue.check must name the one required check');
  if (!Array.isArray(q.second_provider_paths) || !q.second_provider_paths.length) e.push('merge.queue.second_provider_paths must list the gate, auth and billing paths');
  for (const k of ['stuck_minutes', 'verdict_wait_minutes']) if (q[k] !== undefined && !(Number(q[k]) > 0)) e.push(`merge.queue.${k} must be > 0`);
  if (q.post_merge !== undefined && !(typeof q.post_merge?.check === 'string' && q.post_merge.check.trim())) e.push('merge.queue.post_merge.check must be a command');
  return e;
}

// ---------- verdicts live in PR comments (they survive a lost thread; CI reads them on merge_group) ----------
export const verdictBody = rec => `${VERDICT_MARK}\n**eng verdict: ${rec.result}** by \`${rec.by}\` (${rec.family}${rec.provider ? `, ${rec.provider}` : ''}) for patch-id \`${String(rec.patch_id).slice(0, 12)}\` at head \`${String(rec.sha).slice(0, 8)}\`${rec.evidence ? `. Evidence: ${rec.evidence}` : ''}\n\n\`\`\`json\n${JSON.stringify(rec)}\n\`\`\``;
export function parseVerdicts(comments) {
  const out = [];
  for (const c of comments || []) {
    if (!String(c.body || '').startsWith(VERDICT_MARK)) continue;
    const m = c.body.match(/```json\n([\s\S]+?)\n```/); if (!m) continue;
    let v; try { v = JSON.parse(m[1]); } catch { continue; }
    if (v && v.patch_id && v.result && v.by && v.family) out.push({ ...v, comment_at: c.created_at });
  }
  return out.sort((x, y) => (Date.parse(x.at || x.comment_at) || 0) - (Date.parse(y.at || y.comment_at) || 0));
}

// Commit messages -> who wrote the patch (Agent / Agent-Family trailers, and the providers those families run on).
export function authorsFrom(messages, emails = []) {
  const ids = new Set(emails.filter(Boolean)), fams = new Set();
  for (const msg of messages) for (const l of String(msg).split('\n')) {
    const m = l.match(/^(Agent|Agent-Family):\s*(.+)$/); if (!m) continue;
    for (const x of m[2].split(',').map(s => s.trim()).filter(Boolean)) (m[1] === 'Agent' ? ids : fams).add(x);
  }
  const providers = new Set([...fams].map(f => FAMILY_PROVIDER[f.toLowerCase()]).filter(Boolean));
  return { ids, fams, providers };
}

const independent = (verdicts, authors) => verdicts.filter(v => !authors.ids.has(v.by) && !authors.fams.has(v.family));
export const touches = (files, globs) => files.filter(f => globs.some(g => glob2re(g).test(f)));

// The gate. patchId: the patch being merged (merge_group: the queued squash; pull_request: base...head). files: its paths.
// revert: { of, matches } when the PR is labelled auto-revert and its patch is (or is not) the exact inverse of `of` on base.
export function gateDecision({ patchId, files, verdicts, authors, q, revert }) {
  if (revert) return revert.matches ? { pass: true, reasons: [`auto-revert of ${String(revert.of).slice(0, 8)}: the patch is its exact inverse, so it restores the verified state`] }
    : { pass: false, reasons: [`labelled ${q.revert_label} but the patch is not the exact inverse of ${String(revert.of || '?').slice(0, 8)}`] };
  const mine = independent(verdicts.filter(v => v.patch_id === patchId), authors);
  const rejected = verdicts.filter(v => v.patch_id === patchId && !mine.includes(v)).map(v => `${v.by} (${v.family}) wrote or shares a family with this patch`);
  if (!mine.length) return { pass: false, reasons: [`no independent verdict for patch-id ${String(patchId).slice(0, 12)}`, ...rejected], need: 'verdict' };
  // Latest verdict per verifier counts; a later FAIL from anyone independent voids earlier passes.
  const latest = [...new Map(mine.map(v => [v.by, v])).values()];
  const lastAny = mine.at(-1);
  if (!PASSING.has(lastAny.result)) return { pass: false, reasons: [`latest independent verdict is ${lastAny.result} by ${lastAny.by}`], need: 'fix' };
  const passes = latest.filter(v => PASSING.has(v.result));
  const reasons = [`PASS for patch-id ${String(patchId).slice(0, 12)} by ${passes.map(v => `${v.by} (${v.provider || v.family})`).join(', ')}`];
  const sensitive = touches(files, q.second_provider_paths);
  if (sensitive.length) {
    const providers = new Set(passes.map(v => v.provider).filter(Boolean));
    if (providers.size < 2) return { pass: false, reasons: [...reasons, `gate/auth/billing paths changed (${sensitive.slice(0, 3).join(', ')}${sensitive.length > 3 ? ', ...' : ''}): need a second PASS from a verifier on a different provider (have ${[...providers].join(', ') || 'none recorded'})`], need: 'second-provider' };
    reasons.push(`second-provider rule met: ${[...providers].join(' + ')}`);
  }
  return { pass: true, reasons };
}

// merge_group head_ref: refs/heads/gh-readonly-queue/<base>/pr-<n>-<sha>
export const groupPr = ref => Number(String(ref || '').match(/gh-readonly-queue\/.+\/pr-(\d+)-[0-9a-f]+$/)?.[1]) || null;

// Stuck: the required check is red or missing on the head, and nothing happened for stuck_minutes.
export function stuckDecision({ check, lastActivity, now, minutes }) {
  const bad = !check ? 'missing' : check.status !== 'completed' ? null : check.conclusion !== 'success' ? check.conclusion : null;
  if (!bad) return { stuck: false };
  const idle = (now - Date.parse(lastActivity)) / 60e3;
  return idle >= minutes ? { stuck: true, why: `required check ${bad} on head, no activity for ${Math.floor(idle)} min` } : { stuck: false, why: `required check ${bad}; idle ${Math.floor(idle)} of ${minutes} min` };
}

// Restart the owning job: at once on an independent FAIL for this head's patch, or when no verdict has arrived within
// verdict_wait_minutes of the head being pushed. `done`: restart keys already sent (one restart per cause).
export function restartDecision({ verdicts, authors, patchId, head, headAt, now, waitMinutes, done = new Set() }) {
  const mine = independent(verdicts.filter(v => v.patch_id === patchId), authors), last = mine.at(-1);
  if (last && !PASSING.has(last.result)) { const key = `fail:${last.by}:${last.at}`; return done.has(key) ? { restart: false } : { restart: true, key, reason: `verdict FAIL by ${last.by} on ${String(head).slice(0, 8)}${last.evidence ? ` (evidence ${last.evidence})` : ''}` }; }
  if (!last) {
    const waited = (now - Date.parse(headAt)) / 60e3, key = `missing:${head}`;
    if (waited >= waitMinutes && !done.has(key)) return { restart: true, key, reason: `no verdict ${Math.floor(waited)} min after head ${String(head).slice(0, 8)} was pushed` };
  }
  return { restart: false };
}
export const ownerOf = (body, authors) => String(body || '').match(/^Owner:\s*(\S+)/m)?.[1] || [...authors.ids].find(x => !x.includes('@')) || null;
