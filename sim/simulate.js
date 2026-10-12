// Keep in Touch v0: Phase 1 simulation (blueprint "Prove the Intelligence Engine").
//
// Builds fake contact books as real .vcf text (Google-style vCard 3.0, plus Android-style
// quoted-printable), runs them through the same reader and engine the page uses, and
// simulates people using the app once a day for four weeks. Compares the engine with a plain
// random picker. Writes SIM-REPORT.md next to this file.
//
// Run:  node sim/simulate.js            (about a minute)
//
// The fake books use the same kinds of signals the engine looks for, so this proves the
// mechanics and the edge cases, not real-world quality. Only real contact books can do that.
'use strict';
process.env.TZ = 'UTC';
const fs = require('fs');
const path = require('path');
const V = require('../src/vcard.js');
const K = require('../src/engine.js');

const DAY = 86400000;
const HOUR = 3600000;
const T0 = Date.UTC(2026, 9, 12, 0, 0, 0);
const SIZES = [50, 200, 500, 1000, 2000];
const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
const DAYS = 28;

// ------------------------------------------------------------------ names
const FIRST = ['James', 'John', 'Robert', 'Michael', 'David', 'William', 'Richard', 'Joseph', 'Thomas', 'Daniel', 'Matthew', 'Anthony',
  'Mark', 'Steven', 'Andrew', 'Josh', 'Ben', 'Sam', 'Jonathan', 'Ryan', 'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Sarah',
  'Jessica', 'Karen', 'Lisa', 'Nancy', 'Emily', 'Rachel', 'Laura', 'Rebecca', 'Hannah', 'Olivia', 'Emma', 'Grace', 'Chloe', 'Megan'];
const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore',
  'Martin', 'Jackson', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Walker', 'Hall', 'Allen', 'Young', 'King', 'Wright'];
const FAMILY_NAMES = ['Mom', 'Dad', 'Mommy', 'Daddy', 'Grandma', 'Grandpa', 'Nana', 'Uncle Joe', 'Aunt Lisa'];
const ROLE_NAMES = ['Plumber', 'Electrician', 'Handyman', 'Mechanic', 'Lawyer', 'Accountant', 'Realtor', 'Driver', 'Painter', 'Tutor', 'Babysitter'];
const BUSINESSES = ['Pizza Hut', 'City Pharmacy', 'First National Bank', 'Main Street Clinic', 'Dental Center', 'City Taxi', 'Sushi Bar',
  'Grocery Delivery', 'Corner Market', 'Burger Barn', 'Phone Support', 'Cable Service', 'AutoFix Garage', 'Hotel Prima', 'Travel Agency',
  'Hair Salon', 'Book Store', 'Pet Clinic', 'Insurance Office', 'Moving Company'];

// ------------------------------------------------------------------ helpers
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function chance(rng, p) { return rng() < p; }
function between(rng, lo, hi) { return lo + rng() * (hi - lo); }

function qp(text) {
  const bytes = Buffer.from(text, 'utf8');
  let out = '';
  let line = 0;
  for (const b of bytes) {
    const piece = '=' + b.toString(16).toUpperCase().padStart(2, '0');
    if (line + piece.length > 72) { out += '=\n'; line = 0; }
    out += piece;
    line += piece.length;
  }
  return out;
}

function formatIL(rng, digits8, prefix) {
  const n = '0' + prefix + digits8; // 05X + 7 digits... prefix like "50"
  const style = Math.floor(rng() * 4);
  if (style === 0) return n.slice(0, 3) + '-' + n.slice(3, 6) + '-' + n.slice(6);
  if (style === 1) return '+972 ' + n.slice(1, 3) + '-' + n.slice(3, 6) + '-' + n.slice(6);
  if (style === 2) return n;
  return '+972' + n.slice(1);
}

// ------------------------------------------------------------------ fake books
const MIX = [
  ['family', 0.04], ['close', 0.06], ['friend', 0.10], ['acquaintance', 0.22], ['coworker', 0.10],
  ['old', 0.15], ['professional', 0.08], ['business', 0.15], ['nameless', 0.03], ['noNumber', 0.04], ['service', 0.03],
];
const VALUE = { family: 1.0, close: 0.9, friend: 0.6, acquaintance: 0.3, coworker: 0.15, old: 0.05, professional: 0.02, business: 0, nameless: 0.03 };
const CADENCE = { family: [3, 10], close: [10, 30], friend: [30, 90], acquaintance: [60, 180], coworker: [60, 180], old: [3000, 4000], professional: [3000, 4000], business: [3000, 4000], nameless: [3000, 4000] };
const LAST_CONTACT = { family: [0, 7], close: [0, 30], friend: [0, 120], acquaintance: [30, 400], coworker: [10, 200], old: [365, 2000], professional: [30, 400], business: [30, 400], nameless: [30, 900] };
const OUTSIDE = { family: 0.9, close: 0.5, friend: 0.15 };

function makeBook(size, seed) {
  const rng = K.mulberry32(seed * 7919 + size);
  const used = new Set();
  const newMobile = () => {
    for (;;) {
      const prefix = pick(rng, ['50', '52', '53', '54', '55', '58']);
      const d = String(Math.floor(rng() * 1e7)).padStart(7, '0');
      const key = prefix + d;
      if (!used.has(key)) { used.add(key); return { raw: formatIL(rng, d, prefix), key: key.slice(-9) }; }
    }
  };
  const newLandline = () => {
    for (;;) {
      const area = pick(rng, ['2', '3', '4', '8', '9']);
      const d = String(Math.floor(rng() * 1e7)).padStart(7, '0');
      const key = area + d;
      if (!used.has(key)) { used.add(key); return { raw: '0' + area + '-' + d, key }; }
    }
  };
  const truths = [];
  const vcards = [];
  let counts = {};
  for (const [cls, share] of MIX) counts[cls] = Math.max(cls === 'family' ? 2 : 1, Math.round(size * share));

  const personalName = () => ({ first: pick(rng, FIRST), last: pick(rng, LAST) });

  for (const [cls] of MIX) {
    for (let i = 0; i < counts[cls]; i++) {
      const lines = [];
      let android = false;
      let fn = '';
      let n = null;
      let org = '';
      let title = '';
      const cats = ['myContacts'];
      const tels = [];
      let bday = false;
      let photo = false;
      let nickname = '';
      let related = false;
      let email = '';
      const P = (p) => chance(rng, p);

      if (cls === 'family' || cls === 'close' || cls === 'friend' || cls === 'acquaintance' || cls === 'old' || cls === 'coworker' || cls === 'professional') {
        const nm = personalName();
        const full = P({ family: 0.7, close: 0.75, friend: 0.7, acquaintance: 0.55, old: 0.5, coworker: 0.8, professional: 0.5 }[cls]);
        fn = full ? nm.first + ' ' + nm.last : nm.first;
        n = full ? [nm.last, nm.first] : ['', nm.first];
        if (cls === 'family' && P(0.25)) { fn = pick(rng, FAMILY_NAMES); n = ['', fn]; }
        if (cls === 'acquaintance' && P(0.2)) { fn = nm.first + ' ' + pick(rng, ['from the park', 'K', 'neighbor', 'downtown', 'from school']); n = ['', fn]; }
        if (cls === 'old' && P(0.2)) { fn = nm.first + ' camp ' + pick(rng, ['2012', '2015', '2018']); n = ['', fn]; }
        if (cls === 'professional' && P(0.55)) {
          const role = pick(rng, ROLE_NAMES);
          fn = nm.first + ' ' + role;
          n = ['', fn];
        }
        if (cls === 'professional' && P(0.15)) org = pick(rng, ['Fix-It Ltd', 'Lee & Co', 'Home Services']);
        if (cls === 'coworker' && P(0.5)) org = pick(rng, ['Northwind Ltd', 'Acme Ltd', 'StartupX']);
        if (cls === 'coworker' && P(0.25)) title = pick(rng, ['Manager', 'Designer', 'Engineer']);
        if (cls === 'coworker' && P(0.15)) cats.push('Work');
        const starred = { family: 0.5, close: 0.3, friend: 0.05, acquaintance: 0.01, old: 0.01, coworker: 0.02, professional: 0.01 }[cls];
        if (P(starred)) cats.push('starred');
        if (cls === 'family' && P(0.3)) cats.push('Family');
        if (cls === 'close' && P(0.15)) cats.push('Friends');
        if (cls === 'friend' && P(0.05)) cats.push('Friends');
        bday = P({ family: 0.5, close: 0.3, friend: 0.1, acquaintance: 0.03, old: 0.02, coworker: 0.05, professional: 0.01 }[cls]);
        photo = P({ family: 0.4, close: 0.3, friend: 0.15, acquaintance: 0.1, old: 0.05, coworker: 0.1, professional: 0.05 }[cls]);
        nickname = cls === 'family' || cls === 'close' ? (P(0.1) ? 'Nick' + i : '') : '';
        related = cls === 'family' && P(0.1);
        if (P(0.3)) email = (fn.replace(/[^a-z]/gi, '').toLowerCase() || 'p') + i + '@gmail.com';
        if (cls === 'coworker' && P(0.3)) tels.push(Object.assign(newLandline(), { type: 'WORK' }));
        else if (P({ family: 0.95, close: 0.97, friend: 0.95, acquaintance: 0.9, old: 0.85, coworker: 0.9, professional: 0.8 }[cls])) tels.push(Object.assign(newMobile(), { type: 'CELL' }));
        else tels.push(Object.assign(newLandline(), { type: 'HOME' }));
        if (cls === 'family' && P(0.2)) tels.push(Object.assign(newLandline(), { type: 'HOME' }));
        android = P(0.12); // some cards arrive Android-style: vCard 2.1, quoted-printable
      } else if (cls === 'business') {
        fn = pick(rng, BUSINESSES) + (P(0.3) ? ' ' + (i + 1) : '');
        if (P(0.5)) org = fn;
        else if (P(0.3)) { const nm = personalName(); fn = nm.first + ' ' + pick(rng, ['Store', 'Pizza', 'Office', 'Taxi', 'Insurance']); }
        if (P(0.6)) tels.push(Object.assign(newLandline(), { type: P(0.5) ? 'WORK' : 'MAIN' }));
        else tels.push(Object.assign(newMobile(), { type: P(0.5) ? 'CELL' : '' }));
        photo = P(0.1);
      } else if (cls === 'nameless') {
        tels.push(Object.assign(P(0.85) ? newMobile() : newLandline(), { type: '' }));
        fn = '';
      } else if (cls === 'noNumber') {
        const nm = personalName(false);
        fn = nm.first + ' ' + nm.last;
        n = [nm.last, nm.first];
        email = nm.first.toLowerCase() + i + '@example.com';
      } else if (cls === 'service') {
        fn = pick(rng, ['Pizza Line', 'Taxi Order', 'Bank Hotline', 'Clinic Appointments']);
        const star = '*' + String(2000 + Math.floor(rng() * 7000));
        tels.push({ raw: rng() < 0.5 ? star : '1-700-' + String(100000 + Math.floor(rng() * 899999)).replace(/(\d{3})(\d{3})/, '$1-$2'), key: 's' + i + Math.random(), type: '' });
      }

      // vCard text
      lines.push('BEGIN:VCARD');
      if (android) {
        lines.push('VERSION:2.1');
        if (n) lines.push('N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:' + qp(n[0]) + ';' + qp(n[1]) + ';;;');
        lines.push('FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:' + qp(fn));
        for (const t of tels) lines.push('TEL' + (t.type ? ';' + t.type : '') + ':' + t.raw);
      } else {
        lines.push('VERSION:3.0');
        if (fn) {
          lines.push('FN:' + fn.replace(/,/g, '\\,'));
          lines.push('N:' + (n ? n[0] + ';' + n[1] : ';') + ';;;');
        }
        for (const t of tels) lines.push('TEL' + (t.type ? ';TYPE=' + t.type : '') + ':' + t.raw);
      }
      if (email) lines.push('EMAIL;TYPE=INTERNET:' + email);
      if (org) lines.push('ORG:' + org);
      if (title) lines.push('TITLE:' + title);
      if (bday) lines.push('BDAY:19' + (60 + Math.floor(rng() * 40)) + '-0' + (1 + Math.floor(rng() * 9)) + '-1' + Math.floor(rng() * 9));
      if (nickname) lines.push('NICKNAME:' + nickname);
      if (related) lines.push('item9.X-ABRELATEDNAMES:Someone', 'item9.X-ABLabel:_$!<Mother>!$_');
      if (photo) lines.push('PHOTO:https://example.invalid/p/' + i + '.jpg');
      lines.push('CATEGORIES:' + cats.join(','));
      lines.push('END:VCARD');
      vcards.push(lines.join('\r\n'));

      const truth = {
        cls, name: fn, keys: tels.map((t) => t.key),
        value: VALUE[cls] || 0,
        cadence: CADENCE[cls] ? between(rng, CADENCE[cls][0], CADENCE[cls][1]) : 9999,
        lastContact: LAST_CONTACT[cls] ? T0 - between(rng, LAST_CONTACT[cls][0], LAST_CONTACT[cls][1]) * DAY : 0,
        outside: OUTSIDE[cls] || 0,
      };
      truths.push(truth);

      // duplicates: a second card for some personal contacts, number written differently, shorter name
      if (['family', 'close', 'friend', 'acquaintance'].includes(cls) && tels[0] && tels[0].type === 'CELL' && P(0.08)) {
        const raw = tels[0].raw.replace(/[^0-9+]/g, '');
        vcards.push(['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + fn.split(' ')[0], 'N:;' + fn.split(' ')[0] + ';;;', 'TEL;TYPE=CELL:' + raw, 'END:VCARD'].join('\r\n'));
      }
    }
  }
  // shuffle card order
  for (let i = vcards.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [vcards[i], vcards[j]] = [vcards[j], vcards[i]]; }
  return { text: vcards.join('\r\n') + '\r\n', truths };
}

// ------------------------------------------------------------------ simulated people
const USERS = {
  'steady, uses tags': { useRate: 6 / 7, tags: true },
  'steady, no tags': { useRate: 6 / 7, tags: false },
  'on and off, no tags': { useRate: 0.5, tags: false },
};
const PERSONAL = new Set(['family', 'close', 'friend', 'acquaintance']);
const GLAD = new Set(['family', 'close', 'friend']);
const BAD = new Set(['business', 'professional']);

function truthIndex(state, truths) {
  const byKey = new Map();
  truths.forEach((t) => t.keys.forEach((k) => byKey.set(k, t)));
  const of = {};
  for (const [id, p] of Object.entries(state.people)) {
    let t = null;
    for (const num of p.numbers) { t = byKey.get(num.key); if (t) break; }
    of[id] = t || { cls: 'service', value: 0, cadence: 9999, lastContact: 0, outside: 0 };
  }
  return of;
}

function randomPick(state, rng, now, shownToday) {
  const ids = Object.keys(state.people).filter((id) => {
    const p = state.people[id];
    const L = state.learn[id];
    return p.eligible && !(L && (L.hidden || L.business)) && !shownToday.has(id);
  });
  if (!ids.length) return null;
  const id = ids[Math.floor(rng() * ids.length)];
  const L = K.learnOf(state, id);
  L.shown++;
  L.lastShownAt = now;
  const spinId = ++state.seq;
  state.events.push({ t: now, k: 'show', id, s: spinId });
  return { id, spinId, mode: 'random' };
}

function simulate(size, seed, userName, picker) {
  const user = USERS[userName];
  const book = makeBook(size, seed);
  const { cards } = V.parse(book.text);
  const state = K.createState(T0);
  const info = K.importCards(state, cards, T0);
  const truthOf = truthIndex(state, book.truths);
  const engineRng = K.mulberry32(seed * 31 + 7);
  const userRng = K.mulberry32(seed * 131 + size);
  const days = [];
  for (let d = 0; d < DAYS; d++) {
    const dayStart = T0 + d * DAY;
    // life happens outside the app: family and close friends get calls the app never sees
    for (const t of book.truths) {
      if (t.outside && (dayStart - t.lastContact) / DAY >= t.cadence * between(userRng, 0.8, 1.5) && chance(userRng, t.outside)) t.lastContact = dayStart + 9 * HOUR;
    }
    const day = { used: false, shows: [], ids: [], called: false, talked: false, wouldNot: false, wouldNotTalked: false };
    days.push(day);
    if (!chance(userRng, user.useRate)) continue;
    day.used = true;
    const mood = between(userRng, 0.7, 1.0);
    const shownToday = new Set();
    for (let i = 0; i < 6 && !day.called; i++) {
      const now = dayStart + 19 * HOUR + i * 60000;
      const r = picker === 'engine' ? K.spin(state, { now, rng: engineRng }) : randomPick(state, engineRng, now, shownToday);
      if (!r) break;
      shownToday.add(r.id);
      const tr = truthOf[r.id];
      day.shows.push(tr.cls);
      day.ids.push(r.id);
      const L = K.learnOf(state, r.id);
      if (user.tags && !L.rel && tr.cls === 'family' && chance(userRng, 0.4)) K.act(state, r.id, 'family', { now });
      if (user.tags && !L.rel && tr.cls === 'close' && chance(userRng, 0.25)) K.act(state, r.id, 'friend', { now });
      if (BAD.has(tr.cls) || tr.cls === 'service') {
        if (user.tags && chance(userRng, 0.5)) { K.act(state, r.id, 'business', { now }); continue; }
        K.act(state, r.id, 'reroll', { now, spinId: r.spinId });
        continue;
      }
      if (tr.cls === 'old' && user.tags && chance(userRng, 0.3)) { K.act(state, r.id, 'hide', { now }); continue; }
      const since = (now - tr.lastContact) / DAY;
      if (since < tr.cadence * 0.4) {
        if (user.tags && chance(userRng, 0.6)) { K.act(state, r.id, since < 7 ? 'spokeWeek' : 'spokeMonth', { now }); continue; }
        K.act(state, r.id, 'reroll', { now, spinId: r.spinId });
        continue;
      }
      const due = Math.min(1.2, Math.max(0.3, since / tr.cadence));
      if (chance(userRng, tr.value * due * mood)) {
        K.act(state, r.id, 'call', { now, spinId: r.spinId });
        day.called = true;
        // v0.1 asks "Would you have called them today without this?" after any call, answered or not
        const anyway = tr.outside && since >= tr.cadence * 0.9 ? chance(userRng, 0.7) : chance(userRng, tr.outside ? 0.2 : 0.05);
        if (chance(userRng, 0.7)) {
          K.act(state, r.id, 'talked', { now: now + 10 * 60000 });
          day.talked = true;
          K.act(state, r.id, anyway ? 'wouldHave' : 'wouldNot', { now: now + 11 * 60000, outcome: 'talked' });
          if (!anyway) day.wouldNotTalked = true;
          tr.lastContact = now;
        } else {
          K.act(state, r.id, 'noAnswer', { now: now + 2 * 60000 });
          K.act(state, r.id, anyway ? 'wouldHave' : 'wouldNot', { now: now + 3 * 60000, outcome: 'noAnswer' });
        }
        if (!anyway) day.wouldNot = true;
      } else {
        K.act(state, r.id, 'reroll', { now, spinId: r.spinId });
      }
    }
  }
  const gladTotal = book.truths.filter((t) => GLAD.has(t.cls)).length;
  const gladShown = new Set(Object.entries(state.learn).filter(([id, L]) => L.shown > 0 && GLAD.has(truthOf[id].cls)).map(([id]) => id)).size;
  return { days, info, gladTotal, gladShown };
}

function simulateWith(size, seed, userName, exploration) {
  const orig = K.createState;
  K.createState = (now) => { const st = orig(now); st.settings.exploration = exploration; return st; };
  try { return simulate(size, seed, userName, 'engine'); } finally { K.createState = orig; }
}

// ------------------------------------------------------------------ metrics
function summarize(runs) {
  const acc = { firstPersonalEarly: [0, 0], firstBadEarly: [0, 0], gladIn3Early: [0, 0], firstPersonalLate: [0, 0], firstBadLate: [0, 0], gladIn3Late: [0, 0],
    calls: 0, talked: 0, wouldNot: 0, wouldNotTalked: 0, spins: 0, badSpins: 0, usedDays: 0, coverage: [0, 0], repeats: 0 };
  for (const r of runs) {
    r.days.forEach((d, i) => {
      if (!d.used || !d.shows.length) return;
      acc.usedDays++;
      const early = i < 3;
      const late = i >= 14;
      const first = d.shows[0];
      const glad3 = d.shows.slice(0, 3).some((c) => GLAD.has(c));
      if (early) { acc.firstPersonalEarly[0] += PERSONAL.has(first); acc.firstPersonalEarly[1]++; acc.firstBadEarly[0] += BAD.has(first); acc.firstBadEarly[1]++; acc.gladIn3Early[0] += glad3; acc.gladIn3Early[1]++; }
      if (late) { acc.firstPersonalLate[0] += PERSONAL.has(first); acc.firstPersonalLate[1]++; acc.firstBadLate[0] += BAD.has(first); acc.firstBadLate[1]++; acc.gladIn3Late[0] += glad3; acc.gladIn3Late[1]++; }
      acc.calls += d.called;
      acc.talked += d.talked;
      acc.wouldNot += d.wouldNot;
      acc.wouldNotTalked += d.wouldNotTalked;
      acc.spins += d.shows.length;
      acc.badSpins += d.shows.filter((c) => BAD.has(c)).length;
    });
    acc.coverage[0] += r.gladShown;
    acc.coverage[1] += r.gladTotal;
  }
  const pct = (x) => (x[1] ? Math.round((100 * x[0]) / x[1]) : 0);
  const weeks = (runs.length * DAYS) / 7;
  return {
    firstPersonalEarly: pct(acc.firstPersonalEarly), firstBadEarly: pct(acc.firstBadEarly), gladIn3Early: pct(acc.gladIn3Early),
    firstPersonalLate: pct(acc.firstPersonalLate), firstBadLate: pct(acc.firstBadLate), gladIn3Late: pct(acc.gladIn3Late),
    callsPerWeek: (acc.calls / weeks).toFixed(1), talkedPerWeek: (acc.talked / weeks).toFixed(1), wouldNotPerWeek: (acc.wouldNot / weeks).toFixed(1), wouldNotTalkedPerWeek: (acc.wouldNotTalked / weeks).toFixed(1),
    spinsPerCall: acc.calls ? (acc.spins / acc.calls).toFixed(1) : '—', badShare: acc.spins ? Math.round((100 * acc.badSpins) / acc.spins) : 0,
    coverage: pct(acc.coverage),
  };
}

module.exports = { makeBook, simulate, summarize, USERS, SIZES, SEEDS, DAYS, PERSONAL, GLAD, BAD };
if (require.main === module) main();

// ------------------------------------------------------------------ run
function main() {
const started = Date.now();
const rows = [];
const imports = [];
for (const size of SIZES) {
  const firstInfo = simulate(size, 1, 'steady, no tags', 'engine').info;
  imports.push({ size, ...firstInfo });
  for (const userName of Object.keys(USERS)) {
    for (const picker of ['engine', 'random']) {
      if (picker === 'random' && userName !== 'steady, no tags') continue;
      const runs = SEEDS.map((seed) => simulate(size, seed, userName, picker));
      rows.push({ size, user: userName, picker, ...summarize(runs) });
    }
  }
}
// tuning sweep on a 500-contact book: how sharp the weighting is, and how often to explore
const sweep = [];
const saved = { sharpness: K.PARAMS.sharpness, exploration: K.PARAMS.exploration };
for (const sharpness of [1, 2, 3]) {
  for (const exploration of [0.1, 0.2, 0.3]) {
    K.PARAMS.sharpness = sharpness;
    K.PARAMS.exploration = exploration;
    const runs = SEEDS.map((seed) => simulateWith(500, seed, 'steady, no tags', exploration));
    sweep.push({ sharpness, exploration, ...summarize(runs) });
  }
}
K.PARAMS.sharpness = saved.sharpness;
K.PARAMS.exploration = saved.exploration;
const seconds = Math.round((Date.now() - started) / 1000);

// ------------------------------------------------------------------ report
const engineRows = rows.filter((r) => r.picker === 'engine');
const steady = rows.filter((r) => r.user === 'steady, no tags');
const gate = engineRows.map((r) => ({ r, ok: r.firstPersonalEarly >= 65 && r.firstBadEarly <= 8 && r.gladIn3Early >= 60 }));
const lines = [];
lines.push('# Keep in Touch v0: simulation report', '');
lines.push('> Generated ' + new Date().toISOString().slice(0, 10) + ' by `sim/simulate.js` (engine ' + K.VERSION + ', ' + SEEDS.length + ' random seeds per row, ' + DAYS + ' days, ' + seconds + ' s). Day-one figures carry about ±6 points of noise.');
lines.push('> Blueprint Phase 1: does the engine turn a messy contact book into reasonable picks from day one, and does it improve with use?', '');
lines.push('## How to read this', '');
lines.push('Fake contact books were written as real .vcf files (Google-style vCard 3.0, plus Android-style quoted-printable), with duplicates, businesses, service numbers, entries without numbers, numbers saved without a name, people saved by trade ("Avi Plumber"), old contacts and coworkers. They went through the same reader and engine as the page. Simulated people used the app once a day: they call people worth calling who are due, reroll the rest, and (in some rows) use the quick tags. Family and close friends also get calls outside the app that the app never sees.', '');
lines.push('**Limit:** the fake books carry the same kinds of signals the engine looks for, so this proves the mechanics and the edge cases, not real-world quality. Your own contact book is the real test.', '');
lines.push('Personal = family, close friends, friends, acquaintances. Glad to call = family, close friends, friends. Bad = businesses and people saved by trade. Early = days 1–3. Late = days 15–28.', '');
lines.push('## Day one: engine vs. a plain random pick', '');
lines.push('Steady user, no tags.', '');
lines.push('| Contacts | Picker | First spin personal | First spin bad | Glad-to-call in first 3 spins |');
lines.push('|---:|---|---:|---:|---:|');
for (const r of steady) lines.push(`| ${r.size.toLocaleString('en-US')} | ${r.picker === 'engine' ? 'Engine' : 'Random'} | ${r.firstPersonalEarly}% | ${r.firstBadEarly}% | ${r.gladIn3Early}% |`);
lines.push('', '## Four weeks of use', '');
lines.push('| Contacts | User | First spin personal, early → late | First spin bad, early → late | Glad-to-call in first 3, early → late | Calls / week | Conversations / week | Calls that wouldn’t have happened / week (of which talked) | Spins per call | Bad share of all spins | Close people seen in 4 weeks |');
lines.push('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const r of engineRows) lines.push(`| ${r.size.toLocaleString('en-US')} | ${r.user} | ${r.firstPersonalEarly}% → ${r.firstPersonalLate}% | ${r.firstBadEarly}% → ${r.firstBadLate}% | ${r.gladIn3Early}% → ${r.gladIn3Late}% | ${r.callsPerWeek} | ${r.talkedPerWeek} | ${r.wouldNotPerWeek} (${r.wouldNotTalkedPerWeek}) | ${r.spinsPerCall} | ${r.badShare}% | ${r.coverage}% |`);
lines.push('', '## Import check', '');
lines.push('| Contacts written | Cards read | People after merging | Duplicates merged | No number | Service numbers | Can come up | Look like businesses | Look personal |');
lines.push('|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const i of imports) lines.push(`| ${i.size.toLocaleString('en-US')} | ${i.cards} | ${i.people} | ${i.merged} | ${i.noNumber} | ${i.serviceNumbers} | ${i.eligible} | ${i.likelyBusiness} | ${i.likelyPersonal} |`);
lines.push('', '## Tuning check (500 contacts, steady user, no tags)', '');
lines.push('How sharply the engine favors likely-personal contacts (sharpness) and how often it tries someone unknown (exploration). Defaults: sharpness ' + saved.sharpness + ', exploration ' + saved.exploration + '.', '');
lines.push('| Sharpness | Exploration | First spin personal, early → late | First spin bad, early | Glad-to-call in first 3, early → late | Calls that wouldn’t have happened / week | Spins per call | Close people seen in 4 weeks |');
lines.push('|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const r of sweep) lines.push(`| ${r.sharpness} | ${r.exploration} | ${r.firstPersonalEarly}% → ${r.firstPersonalLate}% | ${r.firstBadEarly}% | ${r.gladIn3Early}% → ${r.gladIn3Late}% | ${r.wouldNotPerWeek} | ${r.spinsPerCall} | ${r.coverage}% |`);
lines.push('', '## v0 bar (my proposal)', '');
lines.push('Day one should not feel random or broken: first spin personal ≥ 65%, first spin bad ≤ 8%, and someone glad-to-call within the first three spins on ≥ 60% of days.', '');
lines.push('| Contacts | User | Result |');
lines.push('|---:|---|---|');
for (const g of gate) lines.push(`| ${g.r.size.toLocaleString('en-US')} | ${g.r.user} | ${g.ok ? 'Pass' : 'Below the bar'} |`);
lines.push('');
fs.writeFileSync(path.join(__dirname, 'SIM-REPORT.md'), lines.join('\n'));
console.log(lines.join('\n'));
}
