// eng stack-audit: compare a repo's declared versions against standard/modern-stack.yml floors. Pure; bin/eng.mjs reads the repo.

// Lowest version a spec allows ("^1.46.0" -> [1,46,0], "npm:typescript@7.0.2" -> [7,0,2]). null = no minimum (workspace:, git, "<2", ...).
export function minVersion(spec) {
  let s = String(spec ?? '').trim();
  if (/^(workspace:|file:|link:|catalog:|git|https?:|github:)/.test(s) || s === '*' || s === 'latest' || s.startsWith('<')) return null;
  if (s.startsWith('npm:')) s = s.slice(s.lastIndexOf('@') + 1);
  const m = s.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return m ? m.slice(1).map(x => Number(x || 0)) : null;
}

export function cmp(a, b) { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }

// Every package floor in the standard, with the layer that owns it.
export function floorTable(std) {
  const t = {};
  for (const [layer, l] of Object.entries(std.layers))
    for (const [pkg, v] of Object.entries({ ...l.floors, ...l.alternative_floors })) t[pkg] = { layer, floor: String(v) };
  return t;
}

// facts: { name, deps: {pkg: spec}, packageManager, ciBun: [..], ciNode: [..] } read from the repo by the CLI.
// Returns findings: { repo, layer, item, have, want, status: 'drift' | 'excepted' }.
export function audit(std, facts) {
  const exc = std.exceptions?.[facts.name];
  const allowed = new Set(exc?.allow || []);
  const out = [];
  const add = (layer, item, have, want) => out.push({ repo: facts.name, layer, item, have, want, status: allowed.has(item) ? 'excepted' : 'drift' });

  for (const [pkg, { layer, floor }] of Object.entries(floorTable(std))) {
    const spec = facts.deps[pkg]; if (spec === undefined) continue;
    const have = minVersion(spec), want = minVersion(floor);
    if (have && cmp(have, want) < 0) add(layer, pkg, spec, `>= ${floor}`);
  }
  for (const [layer, l] of Object.entries(std.layers))
    for (const pkg of l.replaces || []) if (facts.deps[pkg] !== undefined) add(layer, pkg, facts.deps[pkg], `removed (replaced by the ${layer} standard)`);

  const rt = std.layers.runtime, [pmName, pmVer] = rt.package_manager.split('@');
  const [haveName, haveVer] = String(facts.packageManager || '').split('@');
  if (!haveName) add('runtime', 'packageManager', 'unpinned', rt.package_manager);
  else if (haveName !== pmName) add('runtime', haveName, facts.packageManager, rt.package_manager);
  else if (cmp(minVersion(haveVer) || [0, 0, 0], minVersion(pmVer)) < 0) add('runtime', 'packageManager', facts.packageManager, rt.package_manager);

  for (const [key, label] of [['ciBun', 'bun'], ['ciNode', 'node']]) {
    const want = minVersion(rt.ci[label]);
    for (const pin of facts[key] || []) { const v = minVersion(pin); if (v && cmp(v, want) < 0) add('runtime', `ci ${label}`, pin, `>= ${rt.ci[label]}`); }
  }
  return out;
}

// The run month for idempotency keys, in Sydney where the fleet's owner works, so a run late on the 31st UTC lands in the new month.
export function sydneyMonth(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit' }).formatToParts(date).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}`;
}

// One Core work.followup-create input per drift finding. dedupe_key is stable per repo, item and target, so the caller can skip
// findings that already have an open follow-up. Core replays an idempotency_key for only 7 days, so it carries the run month.
export function corePayloads(std, findings, { space, target, month }) {
  const safe = s => s.replace(/^>= /, '').replace(/ \(.*$/, '').replace(/[^A-Za-z0-9._:-]+/g, '.');
  return findings.filter(f => f.status === 'drift').map(f => {
    const dedupe_key = `stack-audit:v${std.version}:${f.repo}:${safe(f.item)}:${safe(f.want)}`.slice(0, 120);
    return {
      dedupe_key,
      input: {
        space,
        title: `${f.repo}: ${f.item} ${f.have} -> ${f.want} (${std.name})`.slice(0, 200),
        content: `eng stack-audit found ${f.repo} off the ${std.name} standard.\n\nLayer: ${f.layer}\nItem: ${f.item}\nDeclared: ${f.have}\nStandard: ${f.want}\n\nFloors: eng-standard standard/modern-stack.yml. Reasoning: Core ${std.core.why}.`,
        target_type: target.type,
        target_id: target.id,
        priority: 'normal',
        idempotency_key: `${dedupe_key}:${month}`.slice(0, 128),
      },
    };
  });
}
