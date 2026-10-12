// Keep in Touch: engine tuning check.
//
// Runs engine settings on the same simulated worlds (same contact books, same simulated people, same
// seeds), so a difference comes from the setting, not luck. Each setting is compared with the current
// defaults, with a 95% margin, over every book size and kind of user in sim/simulate.js. Writes TUNING.md.
//
// Run:  node sim/tune.js [seeds]      (default 100 seeds; uses every CPU core)
//
// The simulation's people follow rules written by us, so this can rule a setting out or show a clear
// gain on the mechanics. It can't prove real-world quality; testers' shared stats do that.
'use strict';
process.env.TZ = 'UTC';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const fs = require('fs');
const path = require('path');

const CANDIDATES = [
  { name: 'current defaults', params: {} },
  { name: 'no not-now backoff', params: { rerollBackoff: 1 } },
  { name: 'not-now backoff ×2', params: { rerollBackoff: 2 } },
  { name: 'not-now backoff ×4', params: { rerollBackoff: 4 } },
  { name: 'exploration 0.1', params: { exploration: 0.1 } },
  { name: 'exploration 0.15', params: { exploration: 0.15 } },
  { name: 'sharpness 2.5', params: { sharpness: 2.5 } },
  { name: 'sharpness 3.5', params: { sharpness: 3.5 } },
  { name: 'day-one guess worth 2', params: { priorStrength: 2 } },
  { name: 'day-one guess worth 5', params: { priorStrength: 5 } },
  { name: 'Spin again −0.2', params: { rerollEvidence: 0.2 } },
  { name: 'Spin again −0.5', params: { rerollEvidence: 0.5 } },
  { name: 'just shown ×0.4, not ×0.2', params: { shownSuppression: 0.6 } },
  { name: 'just shown ×0.1, not ×0.2', params: { shownSuppression: 0.9 } },
];
const EXTRA = process.env.KIT_CANDIDATES ? JSON.parse(process.env.KIT_CANDIDATES) : null;

const METRICS = [
  ['glad3Early', 'Glad-to-call in first 3, days 1–3', 'pct', +1],
  ['glad3Late', 'Glad-to-call in first 3, days 15–28', 'pct', +1],
  ['firstBadEarly', 'First spin bad, days 1–3', 'pct', -1],
  ['callsPerWeek', 'Calls / week', 'num', +1],
  ['wouldNotPerWeek', 'Calls that wouldn’t have happened / week', 'num', +1],
  ['spinsPerCall', 'Spins per call', 'num', -1],
  ['badShare', 'Bad share of spins', 'pct', -1],
  ['repeatShare', 'Same person again within 3 days', 'pct', -1],
  ['coverage', 'Close people seen in 4 weeks', 'pct', +1],
];

function runMetrics(r, S) {
  const m = { used: 0, calls: 0, wouldNot: 0, spins: 0, bad: 0, e: 0, eGlad: 0, eBad: 0, l: 0, lGlad: 0, repeats: 0 };
  const lastSeen = new Map();
  r.days.forEach((d, i) => {
    if (!d.used || !d.shows.length) return;
    m.used++;
    m.calls += d.called ? 1 : 0;
    m.wouldNot += d.wouldNot ? 1 : 0;
    m.spins += d.shows.length;
    m.bad += d.shows.filter((c) => S.BAD.has(c)).length;
    const glad3 = d.shows.slice(0, 3).some((c) => S.GLAD.has(c)) ? 1 : 0;
    if (i < 3) { m.e++; m.eGlad += glad3; m.eBad += S.BAD.has(d.shows[0]) ? 1 : 0; }
    if (i >= 14) { m.l++; m.lGlad += glad3; }
    for (const id of d.ids) if (lastSeen.has(id) && lastSeen.get(id) < i && i - lastSeen.get(id) <= 3) m.repeats++;
    for (const id of d.ids) lastSeen.set(id, i);
  });
  const weeks = S.DAYS / 7;
  return {
    glad3Early: m.e ? m.eGlad / m.e : null,
    glad3Late: m.l ? m.lGlad / m.l : null,
    firstBadEarly: m.e ? m.eBad / m.e : null,
    callsPerWeek: m.calls / weeks,
    wouldNotPerWeek: m.wouldNot / weeks,
    spinsPerCall: m.calls ? m.spins / m.calls : null,
    badShare: m.spins ? m.bad / m.spins : null,
    repeatShare: m.spins ? m.repeats / m.spins : null,
    coverage: r.gladTotal ? r.gladShown / r.gladTotal : null,
  };
}

if (!isMainThread) {
  const S = require('./simulate.js');
  const K = require('../src/engine.js');
  parentPort.on('message', (job) => {
    if (!job) { process.exit(0); }
    const saved = Object.assign({}, K.PARAMS);
    Object.assign(K.PARAMS, job.params);
    const out = job.seeds.map((seed) => runMetrics(S.simulate(job.size, seed, job.user, 'engine'), S));
    Object.assign(K.PARAMS, saved);
    parentPort.postMessage({ key: job.key, out });
  });
} else {
  const S = require('./simulate.js');
  const K = require('../src/engine.js');
  const nSeeds = parseInt(process.argv[2], 10) || 100;
  const seeds = Array.from({ length: nSeeds }, (_, i) => i + 1);
  const candidates = EXTRA ? [CANDIDATES[0]].concat(EXTRA) : CANDIDATES;
  const users = Object.keys(S.USERS);
  const jobs = [];
  candidates.forEach((c, ci) => S.SIZES.forEach((size) => users.forEach((user) => {
    jobs.push({ key: ci + '|' + size + '|' + user, params: c.params, size, user, seeds });
  })));
  // biggest books first, so the slowest jobs don't finish last
  jobs.sort((a, b) => b.size - a.size);
  const results = {};
  const started = Date.now();
  const nWorkers = Math.max(1, Math.min(os.cpus().length - 1, jobs.length));
  let next = 0;
  let done = 0;
  const finish = () => {
    const seconds = Math.round((Date.now() - started) / 1000);
    fs.writeFileSync(path.join(__dirname, EXTRA ? 'TUNING-EXTRA.md' : 'TUNING.md'), report(candidates, results, S, users, nSeeds, seconds, K));
    console.log(report(candidates, results, S, users, nSeeds, seconds, K));
  };
  for (let w = 0; w < nWorkers; w++) {
    const worker = new Worker(__filename);
    const feed = () => {
      if (next < jobs.length) worker.postMessage(jobs[next++]);
      else worker.postMessage(null);
    };
    worker.on('message', (msg) => {
      results[msg.key] = msg.out;
      done++;
      if (done % 20 === 0) process.stderr.write(done + '/' + jobs.length + ' jobs\n');
      if (done === jobs.length) finish();
      feed();
    });
    feed();
  }
}

function report(candidates, results, S, users, nSeeds, seconds, K) {
  const cells = [];
  for (const size of S.SIZES) for (const user of users) cells.push({ size, user });
  const fmt = (v, kind) => (v === null ? '–' : kind === 'pct' ? (100 * v).toFixed(1) + '%' : v.toFixed(2));
  const fmtD = (v, kind) => (kind === 'pct' ? (v >= 0 ? '+' : '−') + Math.abs(100 * v).toFixed(1) : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2));
  // level for the defaults, averaged over every cell and seed
  const level = (ci, metric) => {
    const xs = [];
    for (const c of cells) for (const r of results[ci + '|' + c.size + '|' + c.user]) if (r[metric] !== null) xs.push(r[metric]);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  // paired difference against the defaults: same cell, same seed
  const diff = (ci, metric, onlyCells) => {
    const ds = [];
    for (const c of onlyCells || cells) {
      const a = results['0|' + c.size + '|' + c.user];
      const b = results[ci + '|' + c.size + '|' + c.user];
      for (let i = 0; i < a.length; i++) if (a[i][metric] !== null && b[i][metric] !== null) ds.push(b[i][metric] - a[i][metric]);
    }
    const n = ds.length;
    const mean = ds.reduce((x, y) => x + y, 0) / n;
    const sd = Math.sqrt(ds.reduce((x, y) => x + (y - mean) * (y - mean), 0) / Math.max(1, n - 1));
    return { mean, half: 1.96 * sd / Math.sqrt(n) };
  };
  const lines = [];
  lines.push('# Keep in Touch: engine tuning check', '');
  lines.push('> Generated ' + new Date().toISOString().slice(0, 10) + ' by `sim/tune.js` (engine ' + K.VERSION + ', ' + nSeeds + ' seeds × ' + cells.length +
    ' book-size/user combinations per setting, ' + seconds + ' s).');
  lines.push('> Every setting ran on the same simulated worlds as the defaults. A change counts only when its 95% margin stays clear of zero (**bold**).', '');
  lines.push('## Defaults', '');
  lines.push('| Measure | Level |', '|---|---:|');
  for (const [m, label, kind] of METRICS) lines.push('| ' + label + ' | ' + fmt(level(0, m), kind) + ' |');
  lines.push('', '## Each setting against the defaults', '');
  lines.push('Percentage points for percentages. ▲ better, ▼ worse.', '');
  lines.push('| Setting | ' + METRICS.map((x) => x[1]).join(' | ') + ' |');
  lines.push('|---|' + METRICS.map(() => '---:').join('|') + '|');
  for (let ci = 1; ci < candidates.length; ci++) {
    const row = METRICS.map(([m, , kind, dir]) => {
      const d = diff(ci, m);
      const clear = Math.abs(d.mean) > d.half;
      const arrow = clear ? (d.mean * dir > 0 ? ' ▲' : ' ▼') : '';
      const txt = fmtD(d.mean, kind) + ' ±' + (kind === 'pct' ? (100 * d.half).toFixed(1) : d.half.toFixed(2)) + arrow;
      return clear ? '**' + txt + '**' : txt;
    });
    lines.push('| ' + candidates[ci].name + ' | ' + row.join(' | ') + ' |');
  }
  lines.push('', '## Worst case for each setting', '');
  lines.push('The single book-size/user combination where the setting does most harm, for the day-one and call measures.', '');
  lines.push('| Setting | Glad-to-call in first 3, days 1–3 | Calls that wouldn’t have happened / week | Spins per call |');
  lines.push('|---|---:|---:|---:|');
  for (let ci = 1; ci < candidates.length; ci++) {
    const worst = (m, kind, dir) => {
      let w = null;
      for (const c of cells) {
        const d = diff(ci, m, [c]);
        const harm = -dir * d.mean;
        if (!w || harm > w.harm) w = { harm, d, c };
      }
      return fmtD(w.d.mean, kind) + ' (' + w.c.size + ', ' + w.c.user + ')';
    };
    lines.push('| ' + candidates[ci].name + ' | ' + worst('glad3Early', 'pct', 1) + ' | ' + worst('wouldNotPerWeek', 'num', 1) + ' | ' + worst('spinsPerCall', 'num', -1) + ' |');
  }
  lines.push('', '## Settings tried', '');
  for (let ci = 1; ci < candidates.length; ci++) lines.push('- ' + candidates[ci].name + ': `' + JSON.stringify(candidates[ci].params) + '`');
  lines.push('');
  return lines.join('\n');
}
