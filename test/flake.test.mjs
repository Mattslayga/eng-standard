import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flakeVerdict, parseResults, validateFlake, flakeRuns } from '../lib/flake.mjs';

test('flake rule: all pass = blocking, all fail = failing, mixed = quarantine, short = incomplete', () => {
  assert.equal(flakeVerdict([true, true, true]).verdict, 'blocking');
  assert.equal(flakeVerdict([false, false, false]).verdict, 'failing');
  const q = flakeVerdict([true, false, true]);
  assert.equal(q.verdict, 'quarantine'); assert.equal(q.blocking, false); assert.match(q.reason, /report-only and open an issue/);
  assert.equal(flakeVerdict([true, true]).verdict, 'incomplete');
  assert.equal(flakeVerdict([true, true, true, true, false], 5).verdict, 'quarantine');
});

test('flake_runs defaults to 3 and must be an integer >= 2', () => {
  assert.equal(flakeRuns({}), 3); assert.equal(flakeRuns({ flake_runs: 5 }), 5);
  assert.deepEqual(validateFlake({ flake_runs: 3 }), []);
  assert.equal(validateFlake({ flake_runs: 1 }).length, 1);
  assert.equal(validateFlake({ flake_runs: 'x' }).length, 1);
});

test('parseResults', () => {
  assert.deepEqual(parseResults('pass, fail,PASS'), [true, false, true]);
  assert.throws(() => parseResults('pass,maybe'), /unknown run result/);
});
