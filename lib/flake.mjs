// Flake rule for new or changed e2e tests (SHIPPING.md §2, e2e-flow skill).
// A new or changed test must pass `flake_runs` consecutive runs before it may block merges.
// All pass = blocking. All fail = a real failure (fix it). Mixed = flaky: quarantine (report-only) and file an issue.
export const DEFAULT_FLAKE_RUNS = 3;

export function flakeRuns(e2e) { return e2e?.flake_runs ?? DEFAULT_FLAKE_RUNS; }

export function validateFlake(e2e) {
  const n = e2e?.flake_runs;
  if (n === undefined) return [];
  return Number.isInteger(n) && n >= 2 ? [] : [`e2e.flake_runs must be an integer >= 2 (got ${JSON.stringify(n)}); one run cannot show a flake`];
}

// results: array of booleans (true = pass), one per run, in order.
export function flakeVerdict(results, runs = DEFAULT_FLAKE_RUNS) {
  if (results.length < runs) return { verdict: 'incomplete', blocking: false, reason: `${results.length}/${runs} runs; run all ${runs} before deciding` };
  const passed = results.filter(Boolean).length;
  if (passed === results.length) return { verdict: 'blocking', blocking: true, reason: `passed ${passed}/${results.length} consecutive runs; may be a required check` };
  if (passed === 0) return { verdict: 'failing', blocking: true, reason: `failed ${results.length}/${results.length} runs; a real failure, fix it (not a flake)` };
  return { verdict: 'quarantine', blocking: false, reason: `mixed results (${passed}/${results.length} passed): flaky. Quarantine it as report-only and open an issue with the traces; it may not block until it passes ${runs} in a row` };
}

export function parseResults(s) {
  return String(s).split(',').map(x => x.trim().toLowerCase()).filter(Boolean).map(x => {
    if (['pass', 'passed', 'ok', '1', 'true'].includes(x)) return true;
    if (['fail', 'failed', '0', 'false'].includes(x)) return false;
    throw new Error(`unknown run result "${x}" (use pass or fail)`);
  });
}
