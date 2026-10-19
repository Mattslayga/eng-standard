// Self-merge decision for one PR (eng-standard v0.8.0). Pure: live PR state in, { merge, reason } out.
// Merge only when ALL hold: base is main, same-repo branch, not draft, label risk:low, no hold or risk:high label,
// risk recomputed from the files is low, the `test` check is success and the `verdict` status is success on the
// current head SHA, and both have been green for at least hold_minutes (Matt's window to add `hold`).
export const DEFAULTS = { base: 'main', low_label: 'risk:low', high_label: 'risk:high', hold_label: 'hold', hold_minutes: 120, check: 'test', status: 'verdict' };

export function selfMergeConfig(cfg) {
  const s = cfg?.ship?.self_merge || {}, h = cfg?.ship?.high_risk || {};
  const c = { ...DEFAULTS, ...s, high_label: h.label || DEFAULTS.high_label, low_label: h.low_label || DEFAULTS.low_label };
  if (!(Number.isFinite(c.hold_minutes) && c.hold_minutes >= 0)) throw new Error(`ship.self_merge.hold_minutes must be a number >= 0 (got ${JSON.stringify(s.hold_minutes)})`);
  return c;
}

// pr: { number, base, draft, sameRepo, headSha, labels: [names] }
// state: { risk: 'low'|'high', check: { head_sha, status, conclusion, completed_at } | null,
//          status: { state, created_at } | null }   (both read for pr.headSha)
export function decide(pr, state, c, now = Date.now()) {
  const no = reason => ({ merge: false, reason });
  if (pr.base !== c.base) return no(`base is ${pr.base}, not ${c.base}`);
  if (!pr.sameRepo) return no('head branch is in a fork');
  if (pr.draft) return no('draft');
  if (pr.labels.includes(c.hold_label)) return no(`${c.hold_label} label`);
  if (pr.labels.includes(c.high_label)) return no(`${c.high_label}: Matt merges by hand`);
  if (!pr.labels.includes(c.low_label)) return no(`no ${c.low_label} label`);
  if (state.risk !== 'low') return no(`files are ${c.high_label} (recomputed), label says ${c.low_label}`);
  const k = state.check;
  if (!k || k.head_sha !== pr.headSha) return no(`no ${c.check} check on head ${pr.headSha.slice(0, 8)}`);
  if (k.status !== 'completed' || k.conclusion !== 'success') return no(`${c.check} is ${k.conclusion || k.status} on head`);
  const v = state.status;
  if (!v) return no(`no ${c.status} status on head ${pr.headSha.slice(0, 8)}`);
  if (v.state !== 'success') return no(`${c.status} is ${v.state} on head`);
  const readyAt = Math.max(Date.parse(k.completed_at), Date.parse(v.created_at));
  if (!Number.isFinite(readyAt)) return no('cannot read when the checks went green');
  const due = readyAt + c.hold_minutes * 60_000;
  if (now < due) return { merge: false, reason: `hold window: green since ${new Date(readyAt).toISOString()}, merges after ${new Date(due).toISOString()} unless labelled ${c.hold_label}`, due };
  return { merge: true, reason: `all green on ${pr.headSha.slice(0, 8)} for ${Math.floor((now - readyAt) / 60_000)} min (window ${c.hold_minutes})` };
}
