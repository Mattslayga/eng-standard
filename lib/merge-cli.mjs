// IO shell for eng merge gate|watch|post|settings (merge rule v0.10.0; rules in lib/merge-queue.mjs). bin/eng.mjs passes ctx.
// gate runs in the one required check on pull_request and merge_group. watch and post run from the default branch.
// Nothing here merges, pushes to the base branch or edits repo settings: the merge queue merges; settings prints the admin change.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { queueConfig, parseVerdicts, authorsFrom, gateDecision, groupPr, stuckDecision, restartDecision, ownerOf, verdictBody, RESTART_MARK, STUCK_MARK } from './merge-queue.mjs';

export function merge(ctx, [sub, ...rest]) {
  const cmds = { gate, watch, post: postMerge, settings };
  if (!cmds[sub]) ctx.die('usage: eng merge gate [--pr <n>] [--config-from <ref>] | watch [--dry-run] | post [--dry-run] | settings');
  return cmds[sub](ctx, rest);
}

const repo = () => process.env.GITHUB_REPOSITORY || '{owner}/{repo}';
function gh(args, input) {
  const r = spawnSync('gh', args, { encoding: 'utf8', input, timeout: 60e3 });
  if (r.status !== 0) throw new Error(`gh ${args.slice(0, 3).join(' ')}: ${(r.stderr || r.stdout || '').trim().split('\n')[0]}`);
  return r.stdout;
}
const api = (p, ...more) => JSON.parse(gh(['api', ...more, p]) || 'null');
const pages = p => JSON.parse(gh(['api', '--paginate', '--slurp', p]) || '[]').flat();
const post = (method, p, body) => gh(['api', '-X', method, p, '--input', '-'], JSON.stringify(body ?? {}));
function cfgFrom(ctx, ref) { return ref ? YAML.parse(ctx.sh(`git show ${ref}:eng.config.yml`)) : ctx.loadConfig(); }
const pid = (ctx, range) => ctx.sh(`git diff --binary ${range} | git patch-id --stable`).split(' ')[0] || 'empty';
const prFacts = n => {
  const commits = pages(`repos/${repo()}/pulls/${n}/commits?per_page=100`);
  return { comments: pages(`repos/${repo()}/issues/${n}/comments?per_page=100`), authors: authorsFrom(commits.map(c => c.commit.message), commits.map(c => c.commit.author?.email)), commits };
};

export function postVerdict(ctx, n, rec, cfg) {
  post('POST', `repos/${repo()}/issues/${Number(n)}/comments`, { body: verdictBody(rec) });
  const q = queueConfig(cfg); if (!q) return;
  // Comments do not re-run checks: re-run the latest required-check workflow on this head so the gate sees the verdict.
  try {
    const runs = api(`repos/${repo()}/actions/workflows/${q.workflow}/runs?head_sha=${rec.sha}&per_page=5`).workflow_runs || [];
    if (runs[0] && runs[0].status === 'completed') { post('POST', `repos/${repo()}/actions/runs/${runs[0].id}/rerun`); console.log(`  re-ran ${q.workflow} run ${runs[0].id} on ${rec.sha.slice(0, 8)} so ${q.check} sees this verdict`); }
  } catch (e) { console.log(`  could not re-run ${q.workflow}: ${e.message} (re-run it by hand)`); }
}

function gate(ctx, a) {
  const at = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const cfg = cfgFrom(ctx, at('--config-from')), q = queueConfig(cfg) || ctx.die('merge gate: no merge.queue in eng.config.yml');
  const ev = process.env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
  let n, range, label;
  if (ev.merge_group) { n = groupPr(ev.merge_group.head_ref); const h = ev.merge_group.head_sha; range = `${h}^ ${h}`; label = `merge_group ${h.slice(0, 8)} (PR #${n})`; }
  else {
    n = at('--pr') || ev.pull_request?.number || ctx.die('merge gate: no PR (run on pull_request or merge_group, or pass --pr <n>)');
    const h = ev.pull_request?.head?.sha || ctx.head(), b = ctx.sh(`git merge-base ${ctx.baseRef({ project: { default_branch: q.base } })} ${h}`);
    range = `${b} ${h}`; label = `PR #${n} head ${h.slice(0, 8)}`;
  }
  if (!n) ctx.die(`merge gate: cannot read the PR number from ${ev.merge_group?.head_ref}`);
  const patchId = pid(ctx, range), files = ctx.sh(`git diff --name-only ${range}`).split('\n').filter(Boolean);
  const pr = api(`repos/${repo()}/pulls/${n}`), f = prFacts(n);
  let revert = null;
  if (pr.labels.some(l => l.name === q.revert_label)) {
    const of = String(pr.body || '').match(/<!-- eng-auto-revert of=([0-9a-f]{40}) -->/)?.[1];
    revert = { of, matches: !!of && pid(ctx, `${of} ${of}^`) === patchId };
  }
  const d = gateDecision({ patchId, files, verdicts: parseVerdicts(f.comments), authors: f.authors, q, revert });
  const lines = [`${q.check}: ${d.pass ? 'PASS' : 'FAIL'} for ${label}, patch-id ${patchId.slice(0, 12)}`, ...d.reasons.map(r => `  - ${r}`)];
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  if (!d.pass) ctx.die(`merge gate: ${d.need === 'verdict' ? 'an independent verifier records eng verdict PASS|FAIL --provider <p> --pr ' + n + ' for this patch' : d.need === 'second-provider' ? 'a verifier on a different provider records a second PASS' : 'not mergeable'}`);
}

function watch(ctx, a) {
  const dry = a.includes('--dry-run'), cfg = ctx.loadConfig(), q = queueConfig(cfg) || ctx.die('merge watch: no merge.queue in eng.config.yml');
  const hook = process.env[q.restart_webhook_env], now = Date.now();
  const prs = pages(`repos/${repo()}/pulls?state=open&base=${q.base}&per_page=100`).filter(p => !p.draft);
  for (const p of prs) {
    const n = p.number, head = p.head.sha, f = prFacts(n);
    const check = (api(`repos/${repo()}/commits/${head}/check-runs?check_name=${encodeURIComponent(q.check)}&filter=latest`).check_runs || [])[0] || null;
    const lastActivity = [p.updated_at, check?.completed_at, check?.started_at, f.comments.at(-1)?.created_at].filter(Boolean).sort().at(-1);
    const s = stuckDecision({ check, lastActivity, now, minutes: q.stuck_minutes });
    const labelled = p.labels.some(l => l.name === q.stuck_label);
    console.log(`#${n} ${head.slice(0, 8)}: ${s.stuck ? 'STUCK' : 'ok'}${s.why ? ` (${s.why})` : ''}`);
    if (!dry && s.stuck && !labelled) {
      post('POST', `repos/${repo()}/issues/${n}/labels`, { labels: [q.stuck_label] });
      if (!f.comments.some(c => c.body?.startsWith(`${STUCK_MARK}head=${head}`))) post('POST', `repos/${repo()}/issues/${n}/comments`, { body: `${STUCK_MARK}head=${head} -->\n**Stuck:** ${s.why}. The owner fixes the check or the verdict; the label clears itself once the check is green.` });
    }
    if (!dry && !s.stuck && labelled && check?.conclusion === 'success') gh(['api', '-X', 'DELETE', `repos/${repo()}/issues/${n}/labels/${encodeURIComponent(q.stuck_label)}`]);
    // Restart: needs the head's patch-id, from the PR's commits as GitHub reports them.
    spawnSync('git', ['fetch', '-q', 'origin', `pull/${n}/head`], { cwd: ctx.ROOT });
    let patchId = null; try { patchId = pid(ctx, `${ctx.sh(`git merge-base ${ctx.baseRef({ project: { default_branch: q.base } })} ${head}`)} ${head}`); } catch {}
    if (!patchId) { console.log(`  #${n}: cannot compute patch-id (head not fetched); skip restart check`); continue; }
    const done = new Set(f.comments.filter(c => c.body?.startsWith(RESTART_MARK)).map(c => c.body.match(/key=(\S+)/)?.[1]).filter(Boolean));
    const r = restartDecision({ verdicts: parseVerdicts(f.comments), authors: f.authors, patchId, head, headAt: f.commits.at(-1)?.commit?.committer?.date || p.updated_at, now, waitMinutes: q.verdict_wait_minutes, done });
    if (!r.restart) continue;
    const owner = ownerOf(p.body, f.authors), payload = { repo: repo(), pr: n, url: p.html_url, head, owner, reason: r.reason };
    console.log(`  #${n}: RESTART owner ${owner || '(unknown)'}: ${r.reason}${hook ? '' : ` (no ${q.restart_webhook_env}: comment only)`}`);
    if (dry) continue;
    let sent = 'not configured';
    if (hook) { const w = spawnSync('curl', ['-fsS', '-m', '20', '-X', 'POST', '-H', 'Content-Type: application/json', '--data-binary', '@-', hook], { input: JSON.stringify(payload), encoding: 'utf8' }); sent = w.status === 0 ? 'sent' : `failed (curl exit ${w.status})`; }
    post('POST', `repos/${repo()}/issues/${n}/comments`, { body: `${RESTART_MARK}key=${r.key} -->\n**Restart owner** ${owner ? `\`${owner}\`` : '(no Owner: line or Agent trailer)'}: ${r.reason}. Webhook: ${sent}.` });
  }
  console.log(`eng merge watch: ${prs.length} open PR(s) checked${dry ? ' (dry run)' : ''}`);
}

function postMerge(ctx, a) {
  const dry = a.includes('--dry-run'), cfg = ctx.loadConfig(), q = queueConfig(cfg) || ctx.die('merge post: no merge.queue in eng.config.yml');
  const sha = ctx.head(), msg = ctx.sh('git log -1 --format=%B');
  console.log(`  post-merge check on ${sha.slice(0, 8)}: ${q.post_merge.check}`);
  const r = spawnSync('bash', ['-c', q.post_merge.check], { cwd: ctx.ROOT, stdio: 'inherit' });
  if (r.status === 0) return console.log(`eng merge post: PASS on ${sha.slice(0, 8)}`);
  if (/<!-- eng-auto-revert of=/.test(msg) || /^Revert /.test(msg)) ctx.die(`merge post: the post-merge check failed on a revert (${sha.slice(0, 8)}); not reverting a revert. Escalate to the repo lead now.`);
  const branch = `auto-revert/${sha.slice(0, 12)}`, marker = `<!-- eng-auto-revert of=${sha} -->`;
  console.log(`  FAIL: ${dry ? 'would open' : 'opening'} an auto-revert PR from ${branch}`);
  if (dry) process.exit(1);
  const g = (...x) => { const o = spawnSync('git', x, { cwd: ctx.ROOT, encoding: 'utf8' }); if (o.status !== 0) ctx.die(`merge post: git ${x.join(' ')}: ${o.stderr.trim()}`); return o.stdout.trim(); };
  g('switch', '-c', branch);
  g('-c', 'user.name=eng merge bot', '-c', 'user.email=eng-merge-bot@users.noreply.github.com', 'revert', '--no-edit', sha);
  g('-c', 'user.name=eng merge bot', '-c', 'user.email=eng-merge-bot@users.noreply.github.com', 'commit', '--amend', '-m', `Revert ${sha.slice(0, 8)}: post-merge check failed`, '-m', marker);
  g('push', 'origin', `HEAD:refs/heads/${branch}`);
  try { post('POST', `repos/${repo()}/labels`, { name: q.revert_label, color: 'B60205', description: 'Opened by eng merge post; merges through the queue' }); } catch {}
  const pr = JSON.parse(post('POST', `repos/${repo()}/pulls`, { base: q.base, head: branch, title: `Revert ${sha.slice(0, 8)}: post-merge check failed`, body: `${marker}\nThe post-merge check \`${q.post_merge.check}\` failed on ${sha}. This PR is its exact inverse; ${q.check} passes it without a new verdict once tests are green on merge_group.` }));
  post('POST', `repos/${repo()}/issues/${pr.number}/labels`, { labels: [q.revert_label] });
  gh(['pr', 'merge', String(pr.number), '--repo', repo(), '--auto', '--squash']);
  // A PR opened with GITHUB_TOKEN starts no workflows: dispatch the required check on the revert branch.
  try { post('POST', `repos/${repo()}/actions/workflows/${q.workflow}/dispatches`, { ref: branch }); } catch (e) { console.log(`  dispatch ${q.workflow} failed: ${e.message}`); }
  console.log(`eng merge post: FAIL on ${sha.slice(0, 8)}; auto-revert PR #${pr.number} opened with auto-merge on (${pr.html_url})`);
  process.exit(1);
}

// The admin change, printed. eng never edits rulesets or repo settings.
function settings(ctx) {
  const cfg = ctx.loadConfig(), q = queueConfig(cfg) || ctx.die('merge settings: no merge.queue in eng.config.yml');
  let owner = '?'; try { owner = api(`repos/${repo()}`).owner.type; } catch {}
  const ruleset = { name: `${q.base}: merge queue + ${q.check}`, target: 'branch', enforcement: 'active', bypass_actors: [], conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }, { type: 'pull_request', parameters: { required_approving_review_count: 0, dismiss_stale_reviews_on_push: false, require_code_owner_review: false, require_last_push_approval: false, required_review_thread_resolution: false, allowed_merge_methods: ['squash'] } },
      { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: false, required_status_checks: [{ context: q.check }] } },
      { type: 'merge_queue', parameters: { merge_method: 'SQUASH', grouping_strategy: 'ALLGREEN', max_entries_to_build: 5, min_entries_to_merge: 1, max_entries_to_merge: 1, min_entries_to_merge_wait_minutes: 1, check_response_timeout_minutes: 60 } }] };
  console.log(`Admin change for ${repo()} (eng prints it, never applies it). Owner type: ${owner}.`);
  if (owner === 'User') console.log('  BLOCKED: GitHub rejects the merge_queue rule on user-owned repositories (HTTP 422). Move the repo to an organization first (public org repos have the merge queue).');
  console.log(`1. gh api -X PATCH repos/${repo()} -F allow_auto_merge=true -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F delete_branch_on_merge=true`);
  console.log(`2. Replace the ${q.base} ruleset with (one required check, merge queue of one so the verdict binds the queued patch):\n${JSON.stringify(ruleset, null, 2)}`);
  console.log(`3. Secret ${q.restart_webhook_env}: the URL that restarts an owning job (e.g. a T3 webhook task). Without it, watch only comments.`);
}
