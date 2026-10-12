// Keep in Touch v0: automated tests. Run with:  node --test test/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../src/vcard.js');
const K = require('../src/engine.js');

const DAY = 86400000;
const HOUR = 3600000;
const T0 = Date.UTC(2026, 9, 12, 18, 0, 0); // Oct 12, 2026

// ------------------------------------------------------------------ helpers
function card(o) {
  return Object.assign({
    version: '3.0', fn: '', given: '', family: '', middle: '', prefix: '', suffix: '', nickname: '', org: '', orgUnit: '',
    title: '', tels: [], emails: [], categories: [], related: [], bday: false, events: false, hasPhoto: false, uid: '', note: '',
  }, o, {
    name: o.name || o.fn || [o.given, o.family].filter(Boolean).join(' ') || o.org || (o.tels && o.tels[0] && o.tels[0].raw) || '',
    nameFromNumber: !!o.nameFromNumber,
  });
}
const tel = (raw, types, extra) => Object.assign({ raw, types: types || [], group: '', pref: false, label: '' }, extra || {});

function bookState(cards, now) {
  const s = K.createState(now || T0);
  K.importCards(s, cards, now || T0);
  return s;
}
const idByName = (s, name) => Object.values(s.people).find((p) => p.name === name).id;

function shares(s, n, now, seed) {
  const rng = K.mulberry32(seed || 1);
  const counts = {};
  for (let i = 0; i < n; i++) {
    const r = K.spin(s, { now, rng, record: false });
    if (!r) continue;
    counts[r.id] = (counts[r.id] || 0) + 1;
  }
  return counts;
}

// ------------------------------------------------------------------ vCard reader
test('reads a Google Contacts export (vCard 3.0)', () => {
  const text = [
    'BEGIN:VCARD', 'VERSION:3.0', 'FN:Mike Carter', 'N:Carter;Mike;;;', 'TEL;TYPE=CELL:+972 50-123-4567',
    'EMAIL;TYPE=INTERNET:mike@gmail.com', 'BDAY:1990-05-12', 'CATEGORIES:myContacts,starred',
    'item1.URL:http\\://example.com', 'item1.X-ABLabel:', 'END:VCARD',
  ].join('\r\n');
  const { cards, unfinished } = V.parse('﻿' + text);
  assert.equal(unfinished, 0);
  assert.equal(cards.length, 1);
  const c = cards[0];
  assert.equal(c.name, 'Mike Carter');
  assert.equal(c.given, 'Mike');
  assert.equal(c.family, 'Carter');
  assert.deepEqual(c.tels[0].types, ['CELL']);
  assert.equal(c.tels[0].raw, '+972 50-123-4567');
  assert.equal(c.bday, true);
  assert.deepEqual(c.categories, ['myContacts', 'starred']);
  assert.deepEqual(c.emails, ['mike@gmail.com']);
});

test('reads an Android export with quoted-printable accented names and soft line breaks (vCard 2.1)', () => {
  const text = [
    'BEGIN:VCARD', 'VERSION:2.1',
    'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=4D=C3=BC=6C=6C=65=72;=4A=6F=73=C3=A9;;;',
    'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=4A=6F=73=C3=A9=20=4D=',
    '=C3=BC=6C=6C=65=72',
    'TEL;CELL;PREF:050-123-4567',
    'X-ANDROID-CUSTOM:vnd.android.cursor.item/nickname;Joe;1;;;;;;;;;;;;;',
    'END:VCARD',
  ].join('\n');
  const c = V.parse(text).cards[0];
  assert.equal(c.name, 'José Müller');
  assert.equal(c.family, 'Müller');
  assert.equal(c.given, 'José');
  assert.deepEqual(c.tels[0].types, ['CELL', 'PREF']);
  assert.equal(c.tels[0].pref, true);
  assert.equal(c.nickname, 'Joe');
});

test('handles folding, escapes, bare QUOTED-PRINTABLE and windows-1252', () => {
  const text = [
    'BEGIN:VCARD', 'VERSION:3.0', 'FN:Mary Ann', '  Jones', 'N:O\\;Brien;Pat;;;',
    'ORG:Smith\\, Jones & Co;Sales', 'CATEGORIES:Friends\\, close,Work', 'NOTE:line one\\nline two', 'END:VCARD',
    'BEGIN:VCARD', 'VERSION:2.1', 'FN;CHARSET=windows-1252;QUOTED-PRINTABLE:Ren=E9e', 'TEL;HOME:02-5551234', 'END:VCARD',
  ].join('\r\n');
  const [a, b] = V.parse(text).cards;
  assert.equal(a.name, 'Mary Ann Jones');
  assert.equal(a.family, 'O;Brien');
  assert.equal(a.org, 'Smith, Jones & Co');
  assert.equal(a.orgUnit, 'Sales');
  assert.deepEqual(a.categories, ['Friends, close', 'Work']);
  assert.equal(a.note, 'line one\nline two');
  assert.equal(b.name, 'Renée');
});

test('reads iPhone grouped labels, base64 photos and vCard 4.0 tel URIs', () => {
  const text = [
    'BEGIN:VCARD', 'VERSION:3.0', 'FN:Dana Lee',
    'item1.TEL;type=pref:+1 (212) 555-0100', 'item1.X-ABLabel:_$!<Mobile>!$_',
    'item2.X-ABRELATEDNAMES:Emma', 'item2.X-ABLabel:_$!<Sister>!$_',
    'PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQ',
    ' AAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQ',
    ' ERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQU',
    'END:VCARD',
    'BEGIN:VCARD', 'VERSION:4.0', 'FN:Sam Roth', 'TEL;VALUE=uri;TYPE=cell:tel:+1-555-555-0123', 'END:VCARD',
  ].join('\n');
  const [a, b] = V.parse(text).cards;
  assert.equal(a.tels[0].label, 'Mobile');
  assert.ok(a.tels[0].types.includes('MOBILE'));
  assert.equal(a.related.length, 1);
  assert.equal(a.related[0].label, 'Sister');
  assert.equal(a.hasPhoto, true);
  assert.equal(K.classifyNumber(a.tels[0]).mobile, true);
  assert.equal(b.tels[0].raw, '+1-555-555-0123');
  assert.ok(b.tels[0].types.includes('CELL'));
});

test('keeps a card that is missing END:VCARD', () => {
  const { cards, unfinished } = V.parse('BEGIN:VCARD\nFN:A\nTEL:0501111111\nBEGIN:VCARD\nFN:B\nTEL:0502222222\nEND:VCARD\n');
  assert.equal(cards.length, 2);
  assert.equal(unfinished, 1);
});

// ------------------------------------------------------------------ phone numbers
test('normalizes Israeli and US numbers to one key', () => {
  assert.equal(K.classifyNumber(tel('+972 50-123-4567')).key, '501234567');
  assert.equal(K.classifyNumber(tel('050-1234567')).key, '501234567');
  assert.equal(K.classifyNumber(tel('+1 (212) 555-1234')).key, K.classifyNumber(tel('212.555.1234')).key);
  assert.equal(K.classifyNumber(tel('050-1234567')).mobile, true);
  assert.equal(K.classifyNumber(tel('03-1234567')).mobile, false);
});

test('recognizes service, toll-free and fax numbers', () => {
  for (const raw of ['*2421', '101', '1-800-50-50-50', '1700-500-500', '+1 (800) 555-0199', '1-888-555-0123']) {
    const n = K.classifyNumber(tel(raw));
    assert.equal(n.service, true, raw);
    assert.equal(n.callable, false, raw);
  }
  const fax = K.classifyNumber(tel('03-5551234', ['FAX', 'WORK']));
  assert.equal(fax.fax, true);
  assert.equal(fax.callable, false);
});

// ------------------------------------------------------------------ building people
test('merges duplicates that share a number and keeps the fullest name', () => {
  const { people, summary } = K.buildPeople([
    card({ fn: 'Mike', tels: [tel('0501234567', ['CELL'])] }),
    card({ fn: 'Mike Carter', given: 'Mike', family: 'Carter', tels: [tel('+972-50-123-4567'), tel('03-5550000', ['HOME'])] }),
    card({ fn: 'Mike Carter', given: 'Mike', family: 'Carter', tels: [tel('0529999999', ['CELL'])] }),
  ]);
  assert.equal(people.length, 2);
  assert.equal(summary.merged, 1);
  const merged = people.find((p) => p.sources === 2);
  assert.equal(merged.name, 'Mike Carter');
  assert.equal(merged.numbers.length, 2);
  assert.equal(merged.numbers[merged.best].key, '501234567');
});

test('day-one guess ranks personal contacts above businesses', () => {
  const { people } = K.buildPeople([
    card({ fn: 'Rose Stone', given: 'Rose', family: 'Stone', tels: [tel('0501111111', ['CELL'])], categories: ['myContacts', 'starred'], bday: true }),
    card({ fn: 'Joe Keller', given: 'Joe', family: 'Keller', tels: [tel('0502222222', ['CELL'])] }),
    card({ fn: 'Dana Lee', given: 'Dana', family: 'Lee', org: 'Acme', title: 'Engineer', tels: [tel('03-5553333', ['WORK'])] }),
    card({ fn: 'Tom Plumber', given: 'Tom', family: 'Plumber', tels: [tel('0504444444', ['CELL'])] }),
    card({ fn: 'Pizza Hut', org: 'Pizza Hut', tels: [tel('03-5555555', ['WORK'])] }),
  ]);
  const prior = Object.fromEntries(people.map((p) => [p.name, p.prior]));
  assert.ok(prior['Rose Stone'] > 0.9);
  assert.ok(prior['Rose Stone'] > prior['Joe Keller']);
  assert.ok(prior['Joe Keller'] > prior['Dana Lee']);
  assert.ok(prior['Dana Lee'] > prior['Tom Plumber']);
  assert.ok(prior['Tom Plumber'] > prior['Pizza Hut']);
  assert.ok(prior['Pizza Hut'] <= 0.05);
  const pizza = people.find((p) => p.name === 'Pizza Hut');
  assert.ok(pizza.reasons.some((r) => r.text === 'Saved as a company'));
});

test('a business name gets no family boost', () => {
  const { people } = K.buildPeople([
    card({ fn: "Mama's Pizza", tels: [tel('0509999999', ['CELL'])] }),
    card({ fn: 'Grandma', tels: [tel('0501212121', ['CELL'])] }),
    card({ fn: 'Sam Grandison', given: 'Sam', family: 'Grandison', tels: [tel('0508888888', ['CELL'])] }),
  ]);
  const p = Object.fromEntries(people.map((x) => [x.name, x]));
  assert.ok(p["Mama's Pizza"].prior < 0.15, 'a business name gets no family boost');
  assert.ok(p.Grandma.prior > 0.75);
  assert.ok(!p['Sam Grandison'].reasons.some((r) => r.text === 'Family word in the name'), 'a surname that starts like a family word is not one');
});

test('who can come up at all', () => {
  const { people } = K.buildPeople([
    card({ fn: 'Email Only', emails: ['x@y.com'] }),
    card({ fn: 'Pizza Line', tels: [tel('*2421')] }),
    card({ fn: 'Fax Office', tels: [tel('03-5551234', ['FAX'])] }),
    card({ tels: [tel('0507777777', ['CELL'])], nameFromNumber: true }),
  ]);
  const by = Object.fromEntries(people.map((x) => [x.name, x]));
  assert.equal(by['Email Only'].ineligible, 'no-number');
  assert.equal(by['Pizza Line'].ineligible, 'service-number');
  assert.equal(by['Fax Office'].ineligible, 'fax-only');
  const nameless = people.find((x) => x.nameFromNumber);
  assert.equal(nameless.eligible, true);
  assert.ok(nameless.reasons.some((r) => r.text === 'No name saved'));
});

// ------------------------------------------------------------------ the pick
function sampleBook() {
  return [
    card({ fn: 'Starred Friend', given: 'Starred', family: 'Friend', tels: [tel('0501000001', ['CELL'])], categories: ['starred'], bday: true }),
    card({ fn: 'Plain One', given: 'Plain', family: 'One', tels: [tel('0501000002', ['CELL'])] }),
    card({ fn: 'Plain Two', given: 'Plain', family: 'Two', tels: [tel('0501000003', ['CELL'])] }),
    card({ fn: 'Plain Three', given: 'Plain', family: 'Three', tels: [tel('0501000004', ['CELL'])] }),
    card({ fn: 'Tom Plumber', given: 'Tom', family: 'Plumber', tels: [tel('0501000005', ['CELL'])] }),
    card({ fn: 'Pizza Hut', org: 'Pizza Hut', tels: [tel('03-5555555', ['WORK'])] }),
    card({ fn: 'No Number', emails: ['n@n.com'] }),
    card({ fn: 'Star Line', tels: [tel('*3030')] }),
  ];
}

test('never picks someone who cannot come up, and favors likely-personal contacts', () => {
  const s = bookState(sampleBook());
  const counts = shares(s, 6000, T0, 7);
  assert.equal(counts[idByName(s, 'No Number')] || 0, 0);
  assert.equal(counts[idByName(s, 'Star Line')] || 0, 0);
  const starred = counts[idByName(s, 'Starred Friend')] || 0;
  const plain = counts[idByName(s, 'Plain One')] || 0;
  const plumber = counts[idByName(s, 'Tom Plumber')] || 0;
  const pizza = counts[idByName(s, 'Pizza Hut')] || 0;
  assert.ok(starred > plain, `starred ${starred} > plain ${plain}`);
  assert.ok(plain > plumber * 3, `plain ${plain} > 3x plumber ${plumber}`);
  assert.ok(pizza < 60, `pizza picked ${pizza} of 6000`);
});

test('exploration takes about a fifth of spins and only tries uncertain people', () => {
  const s = bookState(sampleBook());
  const rng = K.mulberry32(3);
  let explore = 0;
  for (let i = 0; i < 5000; i++) {
    const r = K.spin(s, { now: T0, rng, record: false });
    if (r.mode === 'explore') {
      explore++;
      const prior = s.people[r.id].prior;
      assert.ok(prior >= K.PARAMS.exploreMinPrior && prior <= K.PARAMS.exploreMaxPrior);
    }
  }
  assert.ok(Math.abs(explore / 5000 - 0.2) < 0.03, `explore share ${explore / 5000}`);
});

test('spin again: that person sits out until tomorrow, then can return', () => {
  const s = bookState(sampleBook());
  const id = idByName(s, 'Starred Friend');
  K.act(s, id, 'reroll', { now: T0 });
  assert.equal(shares(s, 800, T0 + 2 * HOUR, 5)[id] || 0, 0);
  assert.ok((shares(s, 800, T0 + 21 * HOUR, 5)[id] || 0) > 0);
});

test('"not now" in a row: each one keeps them out longer, up to three weeks; a call resets it', () => {
  const s = bookState(sampleBook());
  const id = idByName(s, 'Starred Friend');
  const L = () => s.learn[id];
  const out = (at) => K.suppression(L(), at) === 0;
  K.act(s, id, 'reroll', { now: T0 });
  assert.ok(out(T0 + 19 * HOUR) && !out(T0 + 21 * HOUR), 'first: 20 hours');
  const t2 = T0 + DAY;
  K.act(s, id, 'reroll', { now: t2 });
  assert.ok(out(t2 + 59 * HOUR) && !out(t2 + 61 * HOUR), 'second in a row: 60 hours');
  const t3 = t2 + 3 * DAY;
  K.act(s, id, 'reroll', { now: t3 });
  assert.ok(out(t3 + 7 * DAY) && !out(t3 + 7.6 * DAY), 'third: 7.5 days');
  for (let i = 0; i < 5; i++) K.act(s, id, 'reroll', { now: t3 + 8 * DAY });
  assert.ok(out(t3 + 8 * DAY + 20.9 * DAY) && !out(t3 + 8 * DAY + 21.1 * DAY), 'never more than three weeks');
  const t4 = t3 + 30 * DAY;
  K.act(s, id, 'call', { now: t4 });
  K.act(s, id, 'reroll', { now: t4 + HOUR });
  assert.ok(!out(t4 + HOUR + 21 * HOUR), 'after a call, the next "not now" is back to 20 hours');
  // learning saved before the backoff existed has no streak: the first step applies
  assert.ok(K.suppression({ lastRerollAt: T0 }, T0 + 19 * HOUR) === 0 && K.suppression({ lastRerollAt: T0 }, T0 + 21 * HOUR) > 0, 'no streak recorded = 20 hours');
});

test('after talking, someone is held back until they are due again', () => {
  const s = bookState(sampleBook());
  const id = idByName(s, 'Plain One');
  const peer = idByName(s, 'Plain Two'); // same day-one guess, never touched
  const before = K.weight(s.people[id], K.learnOf(s, id), T0);
  K.act(s, id, 'call', { now: T0, spinId: 1 });
  K.act(s, id, 'talked', { now: T0 + 10 * 60000 });
  const L = K.learnOf(s, id);
  const soon = K.weight(s.people[id], L, T0 + 2 * DAY);
  const peerSoon = K.weight(s.people[peer], K.learnOf(s, peer), T0 + 2 * DAY);
  const due = K.weight(s.people[id], L, T0 + 60 * DAY);
  assert.ok(soon < peerSoon * 0.1, `soon ${soon} vs untouched peer ${peerSoon}`);
  assert.ok(due > before, 'overdue and proven, so more likely than before');
});

test('"Spoke this week" and "Spoke this month" hold someone back', () => {
  const s = bookState(sampleBook());
  const a = idByName(s, 'Plain One');
  const b = idByName(s, 'Plain Two');
  const c = idByName(s, 'Plain Three');
  K.act(s, a, 'spokeWeek', { now: T0 });
  K.act(s, b, 'spokeMonth', { now: T0 });
  const w = (id) => K.weight(s.people[id], K.learnOf(s, id), T0 + HOUR);
  assert.ok(w(a) < w(b), 'this week is held back more than this month');
  assert.ok(w(b) < w(c) * 0.3);
});

test('tags: Family raises, Business and Don’t suggest remove, both can be undone', () => {
  const s = bookState(sampleBook());
  const id = idByName(s, 'Plain One');
  const L = K.learnOf(s, id);
  const base = K.weight(s.people[id], L, T0);
  K.act(s, id, 'family', { now: T0 });
  assert.ok(K.weight(s.people[id], L, T0) > base * 1.5);
  K.act(s, id, 'family', { now: T0 });
  assert.equal(L.rel, '', 'tapping Family again clears it');
  K.act(s, id, 'business', { now: T0 });
  assert.equal(K.weight(s.people[id], L, T0), 0);
  K.act(s, id, 'unbusiness', { now: T0 });
  K.act(s, id, 'hide', { now: T0 });
  assert.equal(K.weight(s.people[id], L, T0), 0);
  assert.equal(K.hiddenPeople(s).length, 1);
  K.act(s, id, 'unhide', { now: T0 });
  assert.ok(K.weight(s.people[id], L, T0) > 0);
});

test('a second tap on Call is the same call; "Didn’t call" undoes it', () => {
  const s = bookState(sampleBook());
  const id = idByName(s, 'Plain Two');
  K.act(s, id, 'call', { now: T0, spinId: 4 });
  K.act(s, id, 'call', { now: T0 + 5000, spinId: 4 });
  const L = K.learnOf(s, id);
  assert.equal(L.calls, 1);
  K.act(s, id, 'notCalled', { now: T0 + 9000, spinId: 4 });
  assert.equal(L.calls, 0);
  assert.equal(L.pos, 0);
  assert.equal(s.pending, null);
  assert.equal(K.stats(s, { now: T0 + DAY }).calls, 0);
});

test('learns a rhythm from repeated conversations', () => {
  const L = Object.assign(K.learnOf(K.createState(T0), 'x'), { contacts: [T0, T0 + 10 * DAY, T0 + 20 * DAY, T0 + 31 * DAY], lastContactAt: T0 + 31 * DAY });
  const c = K.cadenceDays(L);
  assert.equal(c.days, 10);
  assert.equal(c.learned, true);
  assert.ok(Math.abs(K.recencyFactor(L, T0 + 36 * DAY).f - 0.25) < 1e-9);
  assert.ok(K.recencyFactor(L, T0 + 46 * DAY).f > 1);
});

test('"I’d have called them anyway" lowers future nudges a little, never to zero', () => {
  const L = K.learnOf(K.createState(T0), 'x');
  assert.equal(K.topOfMind(L), 1);
  L.wouldHave = 1;
  assert.ok(Math.abs(K.topOfMind(L) - 1 / 1.5) < 1e-9);
  L.wouldHave = 10;
  assert.equal(K.topOfMind(L), K.PARAMS.topOfMindFloor);
});

// ------------------------------------------------------------------ importing again
test('importing again keeps what was learned, even when numbers are reformatted or merged', () => {
  const s = bookState([
    card({ fn: 'Mike Carter', given: 'Mike', family: 'Carter', tels: [tel('0505555555', ['CELL'])] }),
    card({ fn: 'Dana Lee', given: 'Dana', family: 'Lee', tels: [tel('0526666666', ['CELL'])] }),
  ]);
  const mike = idByName(s, 'Mike Carter');
  const dana = idByName(s, 'Dana Lee');
  K.act(s, mike, 'family', { now: T0 });
  K.act(s, dana, 'call', { now: T0, spinId: 1 });
  K.act(s, dana, 'talked', { now: T0 + 60000 });
  const info = K.importCards(s, [
    card({ fn: 'Mike Carter', given: 'Mike', family: 'Carter', tels: [tel('+972 50-555-5555', ['CELL'])] }),
    card({ fn: 'Dana Lee', given: 'Dana', family: 'Lee', tels: [tel('+972-52-666-6666'), tel('0501111111', ['HOME'])] }),
    card({ fn: 'New Person', given: 'New', family: 'Person', tels: [tel('0547777777', ['CELL'])] }),
  ], T0 + DAY);
  assert.equal(info.added, 1);
  assert.equal(info.kept, 2);
  assert.equal(info.removed, 0);
  const dana2 = idByName(s, 'Dana Lee');
  assert.notEqual(dana2, dana, 'id moved to the smaller number key');
  assert.equal(s.learn[dana2].talked, 1);
  assert.equal(s.learn[idByName(s, 'Mike Carter')].rel, 'family');
  assert.ok(s.events.filter((e) => e.k === 'talked').every((e) => e.id === dana2));
});

// ------------------------------------------------------------------ saving, stats, sharing
test('backup round trip, and a clear error for the wrong file', () => {
  const s = bookState(sampleBook());
  K.spin(s, { now: T0, rng: K.mulberry32(1) });
  const copy = K.deserialize(K.serialize(s));
  assert.deepEqual(copy.people, s.people);
  assert.deepEqual(copy.events, s.events);
  assert.equal(copy.seq, s.seq);
  assert.throws(() => K.deserialize('{"hello":1}'), /not a Keep in Touch backup/);
  assert.throws(() => K.deserialize('not json'));
});

test('checkpoint numbers for a day of use', () => {
  const s = bookState(sampleBook());
  const rng = K.mulberry32(11);
  const a = K.spin(s, { now: T0, rng });
  K.act(s, a.id, 'reroll', { now: T0 + 1000, spinId: a.spinId });
  const b = K.spin(s, { now: T0 + 2000, rng });
  K.act(s, b.id, 'call', { now: T0 + 3000, spinId: b.spinId });
  K.act(s, b.id, 'talked', { now: T0 + 600000 });
  K.act(s, b.id, 'wouldNot', { now: T0 + 601000 });
  const st = K.stats(s, { now: T0 + HOUR });
  assert.equal(st.activeDays, 1);
  assert.equal(st.spins, 2);
  assert.equal(st.rerolls, 1);
  assert.equal(st.calls, 1);
  assert.equal(st.talked, 1);
  assert.equal(st.wouldNotHave, 1);
  assert.equal(st.firstThreeDays, 1);
  assert.equal(st.spinsPerCall, 2);
  assert.equal(st.secondsToCall, 3); // first spin at T0, Call at T0 + 3 s
});

test('seconds to Call count from the start of each sitting, as a median', () => {
  const s = bookState(sampleBook());
  const rng = K.mulberry32(5);
  const day = (d, gaps) => {
    let t = T0 + d * DAY;
    let r = K.spin(s, { now: t, rng });
    for (const g of gaps) { K.act(s, r.id, 'reroll', { now: t + 500, spinId: r.spinId }); t += g * 1000; r = K.spin(s, { now: t, rng }); }
    K.act(s, r.id, 'call', { now: t + 4000, spinId: r.spinId });
  };
  day(0, []);          // 4 s
  day(1, [6, 6]);      // 16 s
  day(2, [3]);         // 7 s
  // a spin hours later starts a new sitting, so this call counts 5 s, not hours
  const late = K.spin(s, { now: T0 + 3 * DAY, rng });
  K.act(s, late.id, 'reroll', { now: T0 + 3 * DAY + 500, spinId: late.spinId });
  const again = K.spin(s, { now: T0 + 3 * DAY + 5 * HOUR, rng });
  K.act(s, again.id, 'call', { now: T0 + 3 * DAY + 5 * HOUR + 5000, spinId: again.spinId });
  const st = K.stats(s, { now: T0 + 4 * DAY, days: 0 });
  assert.equal(st.secondsToCall, 6); // median of 4, 5, 7, 16
  assert.match(K.shareableText(s, T0 + 4 * DAY, '0'), /Seconds from first spin to Call \(median\): 6/);
});

test('shared stats contain no names, numbers or ids', () => {
  const s = bookState(sampleBook());
  const rng = K.mulberry32(2);
  for (let d = 0; d < 5; d++) {
    const r = K.spin(s, { now: T0 + d * DAY, rng });
    K.act(s, r.id, 'call', { now: T0 + d * DAY + 1000, spinId: r.spinId });
    K.act(s, r.id, 'talked', { now: T0 + d * DAY + 2000 });
  }
  const text = JSON.stringify(K.shareableStats(s, T0 + 6 * DAY));
  for (const p of Object.values(s.people)) {
    assert.ok(!text.includes(p.name), 'contains ' + p.name);
    assert.ok(!text.includes(p.id), 'contains an id');
    for (const n of p.numbers) if (n.digits.length >= 4) assert.ok(!text.includes(n.digits), 'contains a number');
  }
  assert.ok(text.includes('"talked":5'));
});

// ------------------------------------------------------------------ v0.1.1: stats for the tester round
test('every day-one signal has a code, and the day-one guess is unchanged', () => {
  const s = bookState(sampleBook());
  const p = (name) => s.people[idByName(s, name)];
  assert.deepEqual(p('Starred Friend').signals.slice().sort(), ['birthday', 'fullName', 'mobile', 'starred']);
  assert.deepEqual(p('Tom Plumber').signals.slice().sort(), ['jobName', 'mobile']);
  assert.deepEqual(p('Pizza Hut').signals.slice().sort(), ['businessName', 'company', 'workNumberOnly']);
  // the same numbers as engine 0.1.1: logit(0.4) plus the listed effects
  const sig = (x) => 1 / (1 + Math.exp(-x));
  const base = Math.log(0.4 / 0.6);
  assert.ok(Math.abs(p('Starred Friend').prior - Math.min(0.97, sig(base + 2.2 + 1.0 + 0.5 + 0.4))) < 1e-12);
  assert.ok(Math.abs(p('Plain One').prior - sig(base + 0.5 + 0.4)) < 1e-12);
  assert.ok(Math.abs(p('Tom Plumber').prior - sig(base - 2.0 + 0.5)) < 1e-12);
  for (const person of Object.values(s.people)) for (const c of person.signals) assert.ok(K.SIGNALS.includes(c), c);
  // recomputed on load, never saved
  const back = K.deserialize(K.serialize(s));
  assert.deepEqual(back.people[idByName(s, 'Pizza Hut')].signals, p('Pizza Hut').signals);
  assert.ok(!K.serialize(s).includes('"signals"'));
});

test('fun spins pick exactly like any spin, and are counted', () => {
  const a = bookState(sampleBook()), b = bookState(sampleBook());
  for (let i = 0; i < 20; i++) {
    const t = T0 + i * HOUR;
    const ra = K.spin(a, { now: t, rng: K.mulberry32(100 + i) });
    const rb = K.spin(b, { now: t, rng: K.mulberry32(100 + i), fun: i % 2 === 0 });
    assert.equal(ra.id, rb.id, 'same pick with or without fun');
    if (i === 4 || i === 5) { // a call from a fun spin, then one from a regular spin, in both books
      K.act(a, ra.id, 'call', { now: t + 1000, spinId: ra.spinId });
      K.act(b, rb.id, 'call', { now: t + 1000, spinId: rb.spinId });
    }
  }
  const st = K.stats(b, { now: T0 + DAY, days: 0 });
  assert.equal(st.funSpins, 10);
  assert.equal(st.funCalls, 1);
  assert.equal(K.stats(a, { now: T0 + DAY, days: 0 }).funSpins, 0);
  assert.match(K.shareableText(b, T0 + DAY, '0'), /Everyday spin: reel · fun spins: 10, calls from them: 1/);
  b.settings.everyday = 'phone';
  const back = K.deserialize(K.serialize(b));
  assert.equal(K.shareableStats(back, T0 + DAY).everydaySpin, 'phone', 'the chosen everyday spin is saved and shared');
});

test('shared stats say whether the reminder was added, yes or no only', () => {
  const s = bookState(sampleBook());
  K.spin(s, { now: T0, rng: K.mulberry32(3) });
  assert.match(K.shareableText(s, T0 + HOUR, '0'), /Reminder added to a calendar: no/);
  K.markReminderAdded(s, T0 + 2 * HOUR);
  const back = K.deserialize(K.serialize(s));
  assert.equal(K.shareableStats(back, T0 + 3 * HOUR).reminderAdded, true);
  assert.match(K.shareableText(back, T0 + 3 * HOUR, '0'), /Reminder added to a calendar: yes/);
  assert.ok(!JSON.stringify(K.shareableStats(back, T0 + 3 * HOUR)).includes('20:00'), 'no reminder time or wording leaves');
});

// ------------------------------------------------------------------ engine 0.1.5: more service and family words
test('services read as services; your own family still reads as family', () => {
  const mobile = [tel('054-555-0100', ['CELL'])];
  const s = bookState([
    card({ fn: 'Ruth Wigs', given: 'Ruth', family: 'Wigs', tels: mobile }),
    card({ fn: 'Taxi Number', tels: [tel('054-555-0101', ['CELL'])] }),
    card({ fn: 'Hope Productions', tels: [tel('054-555-0102', ['CELL'])] }),
    card({ fn: 'City Rentals', tels: [tel('054-555-0103', ['CELL'])] }),
    card({ fn: 'Downtown Apartments', tels: [tel('054-555-0104', ['CELL'])] }),
    card({ fn: 'Greg Rowe', given: 'Greg', family: 'Rowe', title: 'Therapist', tels: [tel('054-555-0105', ['CELL'])] }),
    card({ fn: 'Simon Kane', given: 'Simon', family: 'Kane', title: 'Accountant manager', tels: [tel('054-555-0106', ['CELL'])] }),
    card({ fn: 'Mike Carter', given: 'Mike', family: 'Carter', title: 'Engineer', tels: [tel('054-555-0107', ['CELL'])] }),
    card({ fn: 'Ray Help Line', tels: [tel('054-555-0108', ['CELL'])], categories: ['Hotline'] }),
    card({ fn: 'Bob Lewis Wife', given: 'Bob', family: 'Lewis Wife', tels: [tel('054-555-0109', ['CELL'])] }),
    card({ fn: 'Wife', tels: [tel('054-555-0110', ['CELL'])] }),
    card({ fn: 'My husband', tels: [tel('054-555-0111', ['CELL'])] }),
    card({ fn: 'Daddy', tels: [tel('054-555-0112', ['CELL'])] }),
    card({ fn: 'Joe brother', given: 'Joe', family: 'brother', tels: [tel('054-555-0113', ['CELL'])] }),
    card({ fn: 'Mother-in-law', tels: [tel('054-555-0114', ['CELL'])] }),
  ]);
  const p = (name) => s.people[idByName(s, name)];
  for (const name of ['Ruth Wigs', 'Taxi Number', 'Hope Productions', 'City Rentals', 'Downtown Apartments']) {
    assert.ok(p(name).prior < 0.2, name + ' reads as a service: ' + p(name).prior);
  }
  assert.ok(p('Greg Rowe').prior < 0.4 && p('Greg Rowe').signals.includes('jobTitle'), 'a service job title counts like one in the name');
  assert.ok(p('Simon Kane').prior < 0.4, 'a role word anywhere in the title counts');
  assert.ok(p('Mike Carter').prior > 0.5, 'an ordinary job title stays a small effect');
  assert.ok(p('Ray Help Line').signals.includes('businessLabel'), 'a "Hotline" label is a business label');
  assert.ok(!p('Bob Lewis Wife').signals.includes('familyWord'), 'someone else’s wife is not your family');
  for (const name of ['Wife', 'My husband', 'Daddy', 'Joe brother', 'Mother-in-law']) assert.ok(p(name).signals.includes('familyWord'), name + ' is family');
});

test('shared stats count picks by day-one signal, with codes only: no names, numbers, ids or label names', () => {
  const s = bookState(sampleBook().concat([
    card({ fn: 'Rose Stone', given: 'Rose', family: 'Stone', tels: [tel('0501000009', ['CELL'])], categories: ['Rose’s family'] }),
    card({ fn: 'Mark Gold', given: 'Mark', family: 'Gold', tels: [tel('0501000010', ['CELL'])], categories: ['Book club'] }),
  ]));
  const rng = K.mulberry32(5);
  const expected = {};
  const bump = (id, f) => {
    for (const c of s.people[id].signals) {
      expected[c] = expected[c] || { shown: 0, called: 0, spunAgain: 0 };
      expected[c][f]++;
    }
  };
  for (let d = 0; d < 10; d++) {
    const r = K.spin(s, { now: T0 + d * DAY, rng });
    bump(r.id, 'shown');
    if (d % 2) { K.act(s, r.id, 'reroll', { now: T0 + d * DAY + 1000, spinId: r.spinId }); bump(r.id, 'spunAgain'); }
    else { K.act(s, r.id, 'call', { now: T0 + d * DAY + 1000, spinId: r.spinId }); bump(r.id, 'called'); }
  }
  const undone = K.spin(s, { now: T0 + 10 * DAY, rng });
  bump(undone.id, 'shown');
  K.act(s, undone.id, 'call', { now: T0 + 10 * DAY + 1000, spinId: undone.spinId });
  K.act(s, undone.id, 'notCalled', { now: T0 + 10 * DAY + 2000, spinId: undone.spinId }); // "Didn't call" doesn't count
  K.act(s, idByName(s, 'Pizza Hut'), 'business', { now: T0 + 11 * DAY });
  K.act(s, idByName(s, 'Rose Stone'), 'family', { now: T0 + 11 * DAY });
  K.act(s, idByName(s, 'Mark Gold'), 'hide', { now: T0 + 11 * DAY });

  const by = K.signalStats(s);
  for (const [c, e] of Object.entries(expected)) {
    assert.equal(by[c].shown, e.shown, c + ' shown');
    assert.equal(by[c].called, e.called, c + ' called');
    assert.equal(by[c].spunAgain, e.spunAgain, c + ' spun again');
  }
  assert.equal(by.company.business, 1);
  assert.equal(by.familyLabel.people, 1);
  assert.equal(by.familyLabel.friendFamily, 1);
  assert.equal(by.otherLabel.dontSuggest, 1);
  assert.ok(!by.none, 'people who can’t come up (no number, service number) are left out');
  assert.ok(Object.keys(by).every((c) => K.SIGNALS.includes(c) || c === 'none'));

  const now = T0 + 12 * DAY;
  const json = JSON.stringify(K.shareableStats(s, now));
  const text = K.shareableText(s, now, '0.1.1');
  for (const out of [json, text]) {
    for (const p of Object.values(s.people)) {
      assert.ok(!out.includes(p.name), 'contains ' + p.name);
      assert.ok(!out.includes(p.id), 'contains an id');
      for (const n of p.numbers) if (n.digits.length >= 4) assert.ok(!out.includes(n.digits), 'contains a number');
    }
    for (const label of ['Rose', 'Book club']) assert.ok(!out.includes(label), 'contains a label name: ' + label);
  }
  assert.match(text, /^By day-one signal/m);
  assert.match(text, /^familyLabel 1·/m);
  assert.match(text, /^company \d+·\d+·\d+·\d+·1·0·0$/m);
});

test('a longer test reports every week and everything since the first spin', () => {
  const s = bookState(sampleBook());
  const rng = K.mulberry32(23);
  for (let d = 0; d < 26; d++) {
    if (d >= 21 && d % 2) continue; // use drops off in week 4
    const r = K.spin(s, { now: T0 + d * DAY, rng });
    if (d % 3 === 0) K.act(s, r.id, 'call', { now: T0 + d * DAY + 1000, spinId: r.spinId });
  }
  K.recordVerdict(s, 'yes', T0 + 25 * DAY);
  const now = T0 + 26 * DAY;
  const weeks = K.weekly(s, now);
  assert.equal(weeks.length, 4);
  assert.deepEqual(weeks.map((w) => w.activeDays), [7, 7, 7, 2]);
  assert.equal(weeks.reduce((n, w) => n + w.calls, 0), K.stats(s, { now, days: 0 }).calls);
  const text = K.shareableText(s, now, '0.1.1');
  assert.match(text, /^Since the first spin on 2026-10-12: used 23 days/m);
  assert.match(text, /spin again tomorrow: Yes/);
  assert.match(text, /^Last 14 days: used 11 days/m);
  assert.match(text, /w4 2·/);
  assert.equal(K.shareableText(K.createState(T0), T0, '0.1.1').split('\n')[1], 'No spins yet.');
});

test('shared stats count calls that came from "Someone new to try"', () => {
  const s = bookState(sampleBook());
  s.settings.exploration = 1; // every spin explores while someone unknown is left
  const a = K.spin(s, { now: T0, rng: K.mulberry32(3) });
  assert.equal(a.mode, 'explore');
  K.act(s, a.id, 'call', { now: T0 + 1000, spinId: a.spinId });
  const b = K.spin(s, { now: T0 + DAY, rng: K.mulberry32(4) });
  K.act(s, b.id, 'reroll', { now: T0 + DAY + 1000, spinId: b.spinId });
  const st = K.stats(s, { now: T0 + 2 * DAY, days: 0 });
  assert.equal(st.explorationSpins, b.mode === 'explore' ? 2 : 1);
  assert.equal(st.explorationCalls, 1);
  assert.match(K.shareableText(s, T0 + 2 * DAY, '0.1.1'), /^Someone new to try: \d+ spins?, 1 call$/m);
});

test('explains picks in plain words', () => {
  const s = bookState(sampleBook());
  const id = idByName(s, 'Starred Friend');
  assert.deepEqual(K.explain(s, id, T0, 'main').lines, ['Starred · Birthday saved']);
  assert.match(K.explain(s, idByName(s, 'Plain One'), T0, 'explore').lines[0], /Trying someone new/);
  assert.deepEqual(K.explain(s, idByName(s, 'Plain One'), T0, 'main').lines, ['Picked by chance from your contacts']);
  K.act(s, id, 'talked', { now: T0 });
  assert.equal(K.explain(s, id, T0 + HOUR, 'main').lines[0], 'Talked today');
});

test('fast enough for a 3,000-contact phone book', () => {
  const cards = [];
  for (let i = 0; i < 3000; i++) cards.push(card({ fn: 'Person ' + i, given: 'Person', family: String(i), tels: [tel('05' + String(10000000 + i * 7).padStart(8, '0'), ['CELL'])] }));
  const t1 = Date.now();
  const s = bookState(cards);
  const rng = K.mulberry32(9);
  for (let i = 0; i < 200; i++) K.spin(s, { now: T0 + i * HOUR, rng });
  const ms = Date.now() - t1;
  assert.ok(ms < 3000, `took ${ms} ms`);
});

// ------------------------------------------------------------------ v0.1
test('a call that went unanswered still counts as a reach-out that wouldn’t have happened', () => {
  const s = bookState(sampleBook());
  const rng = K.mulberry32(21);
  const a = K.spin(s, { now: T0, rng });
  K.act(s, a.id, 'call', { now: T0 + 1000, spinId: a.spinId });
  K.act(s, a.id, 'noAnswer', { now: T0 + 2000 });
  K.act(s, a.id, 'wouldNot', { now: T0 + 3000, outcome: 'noAnswer' });
  const b = K.spin(s, { now: T0 + DAY, rng });
  K.act(s, b.id, 'call', { now: T0 + DAY + 1000, spinId: b.spinId });
  K.act(s, b.id, 'talked', { now: T0 + DAY + 2000 });
  K.act(s, b.id, 'wouldNot', { now: T0 + DAY + 3000, outcome: 'talked' });
  s.events.push({ t: T0 + DAY + 4000, k: 'wouldNot', id: b.id }); // a v0 event without an outcome counts as talked
  const st = K.stats(s, { now: T0 + 2 * DAY });
  assert.equal(st.wouldNotHave, 3);
  assert.equal(st.wouldNotTalked, 2);
  assert.equal(st.callDays, 2);
});

test('week 1 against week 2', () => {
  const s = bookState(sampleBook());
  const rng = K.mulberry32(22);
  for (let d = 0; d < 14; d++) {
    const r = K.spin(s, { now: T0 + d * DAY, rng });
    if (d >= 7 || d % 2 === 0) K.act(s, r.id, 'call', { now: T0 + d * DAY + 1000, spinId: r.spinId });
  }
  const tr = K.trend(s, T0 + 14 * DAY);
  assert.equal(tr.week1.activeDays, 7);
  assert.equal(tr.week1.callDays, 4);
  assert.equal(tr.week2.callDays, 7);
  assert.equal(K.trend(K.createState(T0), T0), null);
  assert.equal(K.trend(s, T0 + 3 * DAY).week2, null, 'week 2 has not started yet');
});

test('"Would you spin again tomorrow?" is recorded and shared as counts only', () => {
  const s = bookState(sampleBook());
  K.spin(s, { now: T0, rng: K.mulberry32(1) });
  K.recordVerdict(s, 'unsure', T0 + 1000);
  K.recordVerdict(s, 'yes', T0 + 2000);
  assert.equal(K.latestVerdict(s), 'yes');
  assert.equal(K.stats(s, { now: T0 + DAY }).verdict, 'yes');
  const shared = K.shareableStats(s, T0 + DAY);
  assert.equal(shared.last14Days.verdict, 'yes');
  assert.match(shared.trend.start, /^\d{4}-\d{2}-\d{2}$/);
  assert.throws(() => K.recordVerdict(s, 'maybe', T0));
});

test('reset learning forgets tags and evidence but keeps contacts and history', () => {
  const s = bookState(sampleBook());
  const id = idByName(s, 'Plain One');
  K.act(s, id, 'family', { now: T0 });
  K.act(s, idByName(s, 'Plain Two'), 'hide', { now: T0 });
  const people = Object.keys(s.people).length;
  const events = s.events.length;
  K.resetLearning(s, T0 + 1000);
  assert.deepEqual(s.learn, {});
  assert.equal(Object.keys(s.people).length, people);
  assert.equal(s.events.length, events + 1);
  assert.equal(K.hiddenPeople(s).length, 0);
});

test('backups from v0 load with the new settings filled in', () => {
  const s = bookState(sampleBook());
  delete s.settings.reminder;
  delete s.settings.lastBackupAt;
  const loaded = K.deserialize(K.serialize(s));
  assert.deepEqual(loaded.settings.reminder, { time: '20:00', days: [0, 1, 2, 3, 4] });
  assert.equal(loaded.settings.lastBackupAt, 0);
  K.markBackup(loaded, T0);
  assert.equal(loaded.settings.lastBackupAt, T0);
});

test('saved size stays well inside phone browser storage for a big contact book', () => {
  const cards = [];
  for (let i = 0; i < 3000; i++) {
    cards.push(card({ fn: 'Person Number ' + i, given: 'Person', family: 'Number ' + i, tels: [tel('05' + String(20000000 + i * 13).padStart(8, '0'), ['CELL'])], categories: ['myContacts'], emails: ['person' + i + '@gmail.com'] }));
  }
  const s = bookState(cards);
  const rng = K.mulberry32(5);
  for (let d = 0; d < 365; d++) {
    for (let i = 0; i < 5; i++) {
      const r = K.spin(s, { now: T0 + d * DAY + i * 60000, rng });
      K.act(s, r.id, i < 4 ? 'reroll' : 'call', { now: T0 + d * DAY + i * 60000 + 1, spinId: r.spinId });
    }
  }
  const chars = K.serialize(s).length;
  assert.ok(chars < 2.4e6, `${(chars / 1e6).toFixed(2)} million characters after a year with 3,000 contacts`);
});
