// Risk class for one PR (eng-standard's own merge rule, v0.8.0). Pure: changed files + config in, class out.
// risk:high = any changed path (or a rename's old path) matches ship.high_risk.paths. A version_only file (package.json,
// package-lock.json) counts only when something other than its version changed, so a plain version bump stays risk:low.
// No files, or anything we cannot read, is high: unknown is never low.
import { glob2re } from './e2e-policy.mjs';

export function versionOnly(file, baseText, headText) {
  if (typeof baseText !== 'string' || typeof headText !== 'string') return false;
  let b, h;
  try { b = JSON.parse(baseText); h = JSON.parse(headText); } catch { return false; }
  for (const o of [b, h]) {
    if (!o || typeof o !== 'object') return false;
    delete o.version;
    if (file.endsWith('package-lock.json') && o.packages?.['']) delete o.packages[''].version;
  }
  return JSON.stringify(b) === JSON.stringify(h);
}

// files: [{ filename, previous_filename?, status }] as GitHub's pulls/<n>/files returns them.
// bumpOnly: Set of version_only file names whose change is the version field alone (see versionOnly).
export function classifyRisk(files, highRisk, bumpOnly = new Set()) {
  const pats = (highRisk?.paths || []).map(g => [g, glob2re(g)]);
  const vo = new Set(highRisk?.version_only || []);
  const hits = [];
  if (!files?.length) return { risk: 'high', hits: [{ file: '(none)', pattern: 'no changed files read' }] };
  for (const f of files) {
    for (const name of new Set([f.filename, f.previous_filename].filter(Boolean))) {
      if (vo.has(name) && f.status === 'modified' && bumpOnly.has(name)) continue;
      const p = pats.find(([, re]) => re.test(name));
      if (p) hits.push({ file: name, pattern: p[0] });
      else if (vo.has(name)) hits.push({ file: name, pattern: 'version_only (changed beyond the version field)' });
    }
  }
  return { risk: hits.length ? 'high' : 'low', hits };
}
