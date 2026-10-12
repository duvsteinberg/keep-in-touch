/*
 * Keep in Touch v0: the relationship engine.
 *
 * Turns contacts into people, guesses on day one how likely each is a personal relationship,
 * picks someone by weighted chance, and learns from calls, rerolls and quick tags.
 * Everything runs on the device: no network, no dependencies; runs in browsers and in Node.
 * The design and every constant below are explained in ENGINE.md.
 *
 * weight = eligible x probability^sharpness x recency x suppression x relation x top-of-mind
 * 20% of spins are "exploration" spins drawn from people the engine knows little about.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KITEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '0.1.8';
  const SCHEMA = 2; // 2: compact saving (source data only; the rest is recomputed on load)
  const DAY = 86400000;
  const HOUR = 3600000;

  // ---------------------------------------------------------------- tunable constants
  const PARAMS = {
    baseProbability: 0.4,        // day-one guess for a contact with no signals at all
    priorStrength: 3,            // how many observations the day-one guess is worth
    sharpness: 3,                // weight uses probability^sharpness (3 beat 1 and 2 in sim/SIM-REPORT.md)
    exploration: 0.2,            // share of spins drawn from people the engine knows little about
    exploreMinPrior: 0.12,       // ...but not from likely businesses
    exploreMaxPrior: 0.75,       // ...and not from people it is already confident about
    callEvidence: 1.0,           // tapping Call
    talkedEvidence: 0.5,         // answering "We talked" (on top of the call)
    spokeEvidence: 0.75,         // "Spoke this week / month" implies a real relationship
    rerollEvidence: 0.35,        // "Spin again" is a weak, temporary negative
    relationEvidence: { family: 4, friend: 3, work: 0 },
    relationWeight: { family: 1, friend: 1, work: 0.6 },
    defaultCadenceDays: { family: 14, friend: 30, work: 60, none: 45 },
    spokeWeekDaysAgo: 3.5,
    spokeMonthDaysAgo: 15,
    rerollCooldownHours: 20,     // a rerolled person sits out until tomorrow...
    rerollBackoff: 3,            // ...and each "not now" in a row triples that: 20 h, 2.5 days, 7.5 days (sim/TUNING.md)
    rerollMaxDays: 21,           // ...up to three weeks; a call or a conversation resets it
    attemptCooldownHours: 36,    // a call that didn't connect waits a day and a half
    shownSuppression: 0.8,       // someone just shown is 80% less likely right after...
    shownRecoveryDays: 3,        // ...recovering over a few days
    maxOverdueBoost: 1.6,
    topOfMindStep: 0.5,          // "I'd have called them anyway" lowers future nudges a little
    topOfMindFloor: 0.4,
    maxEvents: 20000,
  };

  // ---------------------------------------------------------------- small helpers
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const logit = (p) => Math.log(p / (1 - p));
  const sigmoid = (x) => 1 / (1 + Math.exp(-x));
  const uniq = (arr) => [...new Set(arr)];

  function median(xs) {
    const s = xs.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  /** Small seeded random generator for tests and simulations. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Local calendar day as a number like 20261012. */
  function dayKey(t) {
    const d = new Date(t);
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  // ---------------------------------------------------------------- keyword lists
  // Keywords match whole words in the name.
  const KEYWORDS = {
    businessLatin: [
      'inc', 'llc', 'ltd', 'co', 'corp', 'company', 'gmbh', 'plc', 'store', 'shop', 'market', 'supermarket', 'mall',
      'pharmacy', 'clinic', 'hospital', 'medical', 'dental', 'office', 'dept', 'department', 'service', 'services',
      'support', 'customer', 'helpdesk', 'hotline', 'reception', 'booking', 'bookings', 'reservations', 'delivery',
      'deliveries', 'pizza', 'pizzeria', 'restaurant', 'cafe', 'bakery', 'sushi', 'grill', 'catering', 'hotel', 'motel',
      'taxi', 'cab', 'airline', 'airlines', 'airport', 'bank', 'insurance', 'mortgage', 'credit', 'loans', 'realty',
      'properties', 'agency', 'travel', 'tours', 'salon', 'barbershop', 'spa', 'nails', 'gym', 'fitness', 'studio',
      'academy', 'college', 'university', 'kindergarten', 'daycare', 'garage', 'motors', 'tires', 'repair', 'repairs',
      'plumbing', 'electric', 'hvac', 'cleaning', 'movers', 'moving', 'locksmith', 'printing', 'laundry', 'cleaners',
      'optical', 'optician', 'veterinary', 'courier', 'fedex', 'ups', 'dhl', 'municipality', 'embassy', 'consulate',
      'ministry', 'government', 'ambulance', 'emergency', 'pickup', 'takeout',
      // added 0.1.5
      'wig', 'wigs', 'productions', 'studios', 'travels', 'meals', 'number', 'reminder', 'apt',
      'apartment', 'apartments', 'rentals', 'smartphone', 'cellular', 'hotline', 'line',
      'sons', 'brothers',
    ],
    roleLatin: [
      'plumber', 'electrician', 'handyman', 'contractor', 'mechanic', 'technician', 'tech', 'lawyer', 'attorney', 'notary',
      'accountant', 'cpa', 'bookkeeper', 'realtor', 'broker', 'agent', 'landlord', 'super', 'superintendent', 'driver',
      'painter', 'carpenter', 'gardener', 'cleaner', 'installer', 'dr', 'doctor', 'dentist', 'pediatrician', 'physio',
      'chiropractor', 'optometrist', 'pharmacist', 'vet', 'rep', 'sales', 'recruiter', 'mover', 'courier', 'seller',
      'buyer', 'supplier', 'vendor', 'dealer', 'tailor', 'barber',
      'therapist', 'counselor', 'lcsw', 'coach', 'tutor', 'guide', 'photographer', 'videographer', 'editor', 'writer',
      'caterer', 'chef',
    ],
    workLatin: ['work', 'coworker', 'colleague'],
    familyLatin: [
      'mom', 'mommy', 'mother', 'mum', 'mama', 'ma', 'dad', 'daddy', 'father', 'papa', 'grandma', 'grandpa', 'grandmother', 'grandfather', 'granny', 'aunt', 'auntie', 'uncle', 'tante',
      'cousin', 'brother', 'sister', 'bro', 'sis', 'son', 'daughter', 'wife', 'husband', 'hubby',
      'mother-in-law', 'father-in-law', 'sister-in-law', 'brother-in-law',
    ],
  };

  const LABELS = {
    starred: ['starred', 'favorites', 'favourites', 'favorite', 'favourite'],
    ignore: ['mycontacts', 'my contacts', 'other contacts', 'othercontacts', 'all contacts', 'contacts', 'unlabeled', 'chat buddies'],
    family: ['family', 'relatives', 'parents', 'siblings', 'cousins', 'kids', 'children', 'in-laws', 'inlaws'],
    friend: ['friends', 'friend', 'buddies', 'besties'],
    work: ['work', 'coworkers', 'co-workers', 'colleagues', 'office', 'job', 'team', 'staff', 'employees'],
    business: ['hotline', 'hotlines', 'profession', 'professions', 'professionals', 'business', 'businesses', 'vendors', 'suppliers', 'services', 'service providers', 'contractors', 'clients', 'customers', 'leads'],
  };

  const SPOUSE_WORDS = ['wife', 'husband', 'hubby'];

  const PERSONAL_EMAIL = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|mac|aol|protonmail|proton|gmx|mail|yandex)\./i;

  function latinWords(s) {
    return ' ' + String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]+/g, ' ').trim() + ' ';
  }
  function findLatin(name, list) {
    const w = latinWords(name);
    return list.find((k) => w.includes(' ' + k + ' ')) || '';
  }
  function labelHas(label, k) {
    return label === k || label.startsWith(k + ' ') || label.endsWith(' ' + k) || label.includes(' ' + k + ' ');
  }

  function classifyLabels(categories) {
    const out = { starred: false, family: '', friend: '', work: '', business: '', other: [] };
    for (const raw of categories || []) {
      const c = String(raw).trim();
      const l = c.toLowerCase();
      if (!c || /^imported/i.test(c)) continue;
      if (LABELS.starred.includes(l) || l.includes('starred')) { out.starred = true; continue; }
      if (LABELS.ignore.includes(l)) continue;
      if (LABELS.family.some((k) => labelHas(l, k))) { out.family = out.family || c; continue; }
      if (LABELS.friend.some((k) => labelHas(l, k))) { out.friend = out.friend || c; continue; }
      if (LABELS.business.some((k) => labelHas(l, k))) { out.business = out.business || c; continue; }
      if (LABELS.work.some((k) => labelHas(l, k))) { out.work = out.work || c; continue; }
      out.other.push(c);
    }
    return out;
  }

  // ---------------------------------------------------------------- phone numbers
  function classifyNumber(tel) {
    const raw = String((tel && tel.raw) || '').trim();
    const d = raw.replace(/[^0-9]/g, '');
    const types = ((tel && tel.types) || []).map((t) => String(t).toUpperCase());
    const label = String((tel && tel.label) || '').toLowerCase();
    const n = {
      raw, digits: d, key: '', types, label: (tel && tel.label) || '', pref: !!(tel && tel.pref),
      fax: false, service: false, mobile: null, workish: false, callable: false,
    };
    n.fax = (types.includes('FAX') && !types.includes('VOICE') && !types.includes('CELL')) || /(^|\W)fax(\W|$)/.test(label);
    if (/[*#]/.test(raw) && d) { n.service = true; n.key = '*' + d; }
    else if (d.length > 0 && d.length <= 6) { n.service = true; n.key = '#' + d; }
    else if (d) {
      n.key = d.length >= 9 ? d.slice(-9) : d;
      if (/^1?(800|833|844|855|866|877|888)\d{7}$/.test(d) || /^(?:972)?1(?:700|599|80\d)\d{6}$/.test(d)) n.service = true;
    }
    const typeMobile = types.some((t) => t === 'CELL' || t === 'MOBILE' || t === 'IPHONE' || t === 'CELLULAR') || /mobile|cell/.test(label);
    if (typeMobile || /^(?:972|0)5\d{8}$/.test(d)) n.mobile = true;
    else if (/^(?:972|0)[23489]\d{7}$/.test(d)) n.mobile = false;
    n.workish = types.some((t) => t === 'WORK' || t === 'MAIN' || t === 'COMPANY' || t === 'X-COMPANY' || t === 'COMPANY_MAIN') || /work|office/.test(label);
    n.callable = d.length >= 7 && !n.fax && !n.service;
    return n;
  }

  // ---------------------------------------------------------------- day-one guess
  // Every day-one signal has a fixed code. Shared stats count picks by these codes, never by the
  // reason text, which can quote the user's own label names.
  const SIGNALS = [
    'starred', 'familyLabel', 'friendLabel', 'otherLabel', 'workLabel', 'businessLabel', 'familyWord', 'birthday',
    'otherDate', 'relationship', 'nickname', 'photo', 'personalEmail', 'businessName', 'jobName', 'workName', 'fullName',
    'company', 'companyField', 'jobTitle', 'mobile', 'workNumberOnly', 'landlineOnly', 'noName', 'numbersInName',
  ];

  function dayOnePrior(person) {
    const reasons = [];
    const signals = [];
    let lo = logit(PARAMS.baseProbability);
    const add = (w, text, code) => { lo += w; signals.push(code); if (text) reasons.push({ text, w }); };
    const name = person.name || '';
    const labels = classifyLabels(person.categories);

    if (labels.starred) add(2.2, 'Starred', 'starred');
    if (labels.family) add(1.8, 'In your “' + labels.family + '” label', 'familyLabel');
    if (labels.friend) add(1.5, 'In your “' + labels.friend + '” label', 'friendLabel');
    if (labels.other.length) add(0.3, 'In your “' + labels.other[0] + '” label', 'otherLabel');
    if (labels.work) add(-0.6, 'In your “' + labels.work + '” label', 'workLabel');
    if (labels.business) add(-2.5, 'In your “' + labels.business + '” label', 'businessLabel');

    const biz = findLatin(name, KEYWORDS.businessLatin);
    // "Wife" after a name is usually someone else's ("Mike Carter Wife"); it means yours only first ("Wife", "My wife").
    const firstWords = latinWords(name).trim().split(' ');
    const spouse = SPOUSE_WORDS.includes(firstWords[0]) || (firstWords[0] === 'my' && SPOUSE_WORDS.includes(firstWords[1]));
    const fam = !biz && (findLatin(name, KEYWORDS.familyLatin.filter((k) => !SPOUSE_WORDS.includes(k))) || (spouse && 'spouse'));
    if (fam) add(2.0, 'Family word in the name', 'familyWord');
    if (person.bday) add(1.0, 'Birthday saved', 'birthday');
    if (person.events) add(0.6, 'A date saved', 'otherDate');
    if (person.related > 0) add(0.8, 'Relationship saved', 'relationship');
    if (person.nickname) add(0.6, 'Nickname saved', 'nickname');
    if (person.hasPhoto) add(0.3, 'Has a photo', 'photo');
    if ((person.emails || []).some((e) => PERSONAL_EMAIL.test(e))) add(0.2, null, 'personalEmail');

    const role = !biz && findLatin(name, KEYWORDS.roleLatin);
    if (biz) add(-2.2, 'Name looks like a business', 'businessName');
    else if (role) add(-2.0, 'Name includes a job or service', 'jobName');
    else if (findLatin(name, KEYWORDS.workLatin)) add(-0.6, 'Name mentions work', 'workName');
    // A full first + last name hints at a person, unless the "last name" is a trade ("Tom Plumber").
    if (person.given && person.family && !biz && !role) add(0.4, null, 'fullName');
    const sameAsOrg = person.org && (!person.fnRaw || person.fnRaw.trim().toLowerCase() === person.org.trim().toLowerCase());
    if (person.org && !person.given && !person.family && sameAsOrg) add(-2.5, 'Saved as a company', 'company');
    else if (person.org) add(-0.5, 'Company field filled in', 'companyField');
    // A service in the job-title field ("Therapist", "Broker") is the same evidence as one in the name.
    if (person.title && !biz && !role && findLatin(person.title, KEYWORDS.roleLatin)) add(-1.5, 'Job title is a service', 'jobTitle');
    else if (person.title) add(-0.3, 'Job title saved', 'jobTitle');

    const callable = person.numbers.filter((n) => n.callable);
    if (callable.some((n) => n.mobile && !n.workish)) add(0.5, 'Has a mobile number', 'mobile');
    else if (callable.length && callable.every((n) => n.workish)) add(-0.8, 'Only a work or main number', 'workNumberOnly');
    else if (callable.length && callable.every((n) => n.mobile === false)) add(-0.3, 'Landline only', 'landlineOnly');

    if (person.nameFromNumber) add(-1.5, 'No name saved', 'noName');
    else if (/\d/.test(name)) add(-0.6, 'Name contains numbers', 'numbersInName');

    reasons.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
    return { prob: clamp(sigmoid(lo), 0.02, 0.97), reasons, signals };
  }

  function baseIneligibility(person) {
    if (!person.numbers.length) return 'no-number';
    if (person.numbers.some((n) => n.callable)) return '';
    if (person.numbers.some((n) => n.service)) return 'service-number';
    if (person.numbers.every((n) => n.fax)) return 'fax-only';
    return 'no-number';
  }

  // ---------------------------------------------------------------- building people from cards
  function nameScore(c) {
    let s = 0;
    if (c.given) s += 2;
    if (c.family) s += 2;
    if (c.fn) s += 1;
    if (c.nameFromNumber) s -= 5;
    return s + Math.min(String(c.name || '').length, 40) / 100;
  }

  function bestNumberIndex(numbers) {
    let best = -1;
    let bestScore = -Infinity;
    numbers.forEach((num, i) => {
      if (!num.callable) return;
      let s = 0;
      if (num.mobile && !num.workish) s += 4;
      else if (num.mobile) s += 2;
      if (num.pref) s += 1;
      if (num.workish) s -= 1;
      if (num.types.includes('HOME')) s += 0.5;
      if (s > bestScore) { bestScore = s; best = i; }
    });
    return best;
  }

  function mergeCards(cs, numsList) {
    const best = cs.slice().sort((a, b) => nameScore(b) - nameScore(a))[0];
    const numbers = [];
    const byKey = new Map();
    for (const num of numsList.flat()) {
      const k = num.key || num.raw;
      const ex = byKey.get(k);
      if (ex) {
        num.types.forEach((t) => { if (!ex.types.includes(t)) ex.types.push(t); });
        if (num.mobile) ex.mobile = true;
        ex.pref = ex.pref || num.pref;
        ex.workish = ex.workish && num.workish;
        continue;
      }
      const copy = Object.assign({}, num, { types: num.types.slice() });
      byKey.set(k, copy);
      numbers.push(copy);
    }
    const firstOf = (field) => (cs.find((c) => c[field]) || {})[field] || '';
    const rawName = String(best.name || '').trim();
    const person = {
      id: '',
      name: rawName,
      fnRaw: best.fn || '',
      given: best.given || '',
      family: best.family || '',
      nickname: firstOf('nickname'),
      org: firstOf('org'),
      title: firstOf('title'),
      categories: uniq(cs.flatMap((c) => c.categories || [])),
      emails: uniq(cs.flatMap((c) => c.emails || [])),
      bday: cs.some((c) => c.bday),
      events: cs.some((c) => c.events),
      related: cs.reduce((s, c) => s + (c.related || []).length, 0),
      hasPhoto: cs.some((c) => c.hasPhoto),
      nameFromNumber: cs.every((c) => c.nameFromNumber) || /^[\d\s+()\-.*#]+$/.test(rawName),
      sources: cs.length,
      numbers,
    };
    if (!person.name) person.name = (numbers[0] && numbers[0].raw) || person.emails[0] || 'No name';
    person.best = bestNumberIndex(numbers);
    const keys = numbers.filter((n) => n.key).map((n) => n.key).sort();
    person.id = keys.length ? 'p' + keys[0] : 'n' + fnv1a([person.name].concat(person.emails).join('|').toLowerCase());
    const pr = dayOnePrior(person);
    person.prior = pr.prob;
    person.reasons = pr.reasons;
    person.signals = pr.signals;
    person.ineligible = baseIneligibility(person);
    person.eligible = !person.ineligible;
    return person;
  }

  /** Cards (from KITVcard.parse) -> merged people with a day-one guess. */
  function buildPeople(cards) {
    const n = cards.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
    const classified = cards.map((c) => (c.tels || []).map(classifyNumber));
    const owner = new Map();
    classified.forEach((nums, i) => nums.forEach((num) => {
      if (!num.key || (num.key.length < 7 && !/^[*#]/.test(num.key))) return;
      if (owner.has(num.key)) union(i, owner.get(num.key));
      else owner.set(num.key, i);
    }));
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(i);
    }
    const people = [];
    const used = new Set();
    for (const idxs of groups.values()) {
      const p = mergeCards(idxs.map((i) => cards[i]), idxs.map((i) => classified[i]));
      let id = p.id;
      let k = 2;
      while (used.has(id)) id = p.id + '-' + k++;
      p.id = id;
      used.add(id);
      people.push(p);
    }
    const summary = {
      cards: n,
      people: people.length,
      merged: n - people.length,
      noNumber: people.filter((p) => p.ineligible === 'no-number' || p.ineligible === 'fax-only').length,
      serviceNumbers: people.filter((p) => p.ineligible === 'service-number').length,
      likelyBusiness: people.filter((p) => p.eligible && p.prior < 0.15).length,
      likelyPersonal: people.filter((p) => p.eligible && p.prior >= 0.6).length,
      eligible: people.filter((p) => p.eligible).length,
    };
    return { people, summary };
  }

  // ---------------------------------------------------------------- state
  function newLearn() {
    return {
      rel: '', business: false, hidden: false, pos: 0, neg: 0,
      shown: 0, rerolls: 0, notNow: 0, calls: 0, talked: 0, noAnswer: 0, wouldHave: 0, wouldNot: 0,
      lastShownAt: 0, lastRerollAt: 0, lastAttemptAt: 0, lastContactAt: 0, contacts: [],
    };
  }

  function defaultSettings() {
    // reminder days use JavaScript numbering: 0 = Sunday ... 6 = Saturday. Default Sunday to Thursday.
    return { exploration: PARAMS.exploration, reminder: { time: '20:00', days: [0, 1, 2, 3, 4] }, lastBackupAt: 0, reminderAddedAt: 0, everyday: 'reel' };
  }

  function createState(now) {
    const t = now || Date.now();
    return {
      app: 'keep-in-touch', schema: SCHEMA, engine: VERSION, createdAt: t, updatedAt: t,
      people: {}, learn: {}, events: [], pending: null, seq: 0,
      settings: defaultSettings(), importInfo: null,
    };
  }

  function learnOf(state, id) {
    if (!state.learn[id]) state.learn[id] = newLearn();
    return state.learn[id];
  }

  function logEvent(state, e) {
    state.events.push(e);
    if (state.events.length > PARAMS.maxEvents) state.events.splice(0, state.events.length - PARAMS.maxEvents);
    state.updatedAt = e.t;
  }

  function mergeLearn(into, from) {
    if (!into.rel && from.rel) into.rel = from.rel;
    into.business = into.business || from.business;
    into.hidden = into.hidden || from.hidden;
    for (const k of ['pos', 'neg', 'shown', 'rerolls', 'calls', 'talked', 'noAnswer', 'wouldHave', 'wouldNot']) into[k] += from[k] || 0;
    into.notNow = Math.max(into.notNow || 0, from.notNow || 0);
    for (const k of ['lastShownAt', 'lastRerollAt', 'lastAttemptAt', 'lastContactAt']) into[k] = Math.max(into[k] || 0, from[k] || 0);
    into.contacts = uniq((into.contacts || []).concat(from.contacts || [])).sort((a, b) => a - b);
  }

  /** Replace the contact list from a new import, keeping everything learned about people still present. */
  function importCards(state, cards, now) {
    const t = now || Date.now();
    const built = buildPeople(cards);
    const prev = state.people || {};
    const keyToOld = new Map();
    for (const [oldId, p] of Object.entries(prev)) for (const num of p.numbers || []) if (num.key) keyToOld.set(num.key, oldId);
    const next = {};
    const reused = new Set();
    let kept = 0;
    let added = 0;
    for (const p of built.people) {
      next[p.id] = p;
      if (prev[p.id]) { kept++; continue; }
      const oldIds = uniq(p.numbers.map((num) => keyToOld.get(num.key)).filter(Boolean));
      if (oldIds.length) {
        kept++;
        for (const oldId of oldIds) {
          reused.add(oldId);
          if (state.pending && state.pending.id === oldId) state.pending.id = p.id;
          if (state.learn[oldId] && oldId !== p.id) {
            if (state.learn[p.id]) mergeLearn(state.learn[p.id], state.learn[oldId]);
            else state.learn[p.id] = state.learn[oldId];
            delete state.learn[oldId];
            for (const e of state.events) if (e.id === oldId) e.id = p.id;
          }
        }
      } else added++;
    }
    const removed = Object.keys(prev).filter((id) => !next[id] && !reused.has(id)).length;
    state.people = next;
    state.importInfo = Object.assign({}, built.summary, { at: t, kept, added, removed });
    state.updatedAt = t;
    return state.importInfo;
  }

  // ---------------------------------------------------------------- scoring
  function probability(person, L) {
    const n0 = PARAMS.priorStrength;
    const relA = L.rel ? (PARAMS.relationEvidence[L.rel] || 0) : 0;
    const a = person.prior * n0 + L.pos + relA;
    const b = (1 - person.prior) * n0 + L.neg;
    return { p: a / (a + b), observations: L.pos + L.neg + (L.rel ? 2 : 0) };
  }

  function cadenceDays(L) {
    const def = PARAMS.defaultCadenceDays[L.rel || 'none'] || PARAMS.defaultCadenceDays.none;
    const ts = (L.contacts || []).slice().sort((x, y) => x - y);
    const gaps = [];
    for (let i = 1; i < ts.length; i++) {
      const g = (ts[i] - ts[i - 1]) / DAY;
      if (g >= 1) gaps.push(g);
    }
    let c = def;
    if (gaps.length >= 2) c = median(gaps);
    else if (gaps.length === 1) c = (gaps[0] + def) / 2;
    return { days: clamp(c, 3, 365), learned: gaps.length >= 2 };
  }

  function recencyFactor(L, now) {
    if (!L.lastContactAt) return { f: 1, known: false };
    const days = Math.max(0, (now - L.lastContactAt) / DAY);
    const cad = cadenceDays(L);
    const ratio = days / cad.days;
    const f = ratio < 1 ? Math.max(0.03, ratio * ratio) : Math.min(PARAMS.maxOverdueBoost, 1 + (ratio - 1) * 0.3);
    return { f, known: true, days, cadence: cad.days, cadenceLearned: cad.learned, ratio };
  }

  /** How long a "Spin again" keeps someone out: longer for each "not now" in a row. */
  function rerollCooldownMs(L) {
    const streak = Math.max(1, L.notNow || 0);
    const hours = PARAMS.rerollCooldownHours * Math.pow(PARAMS.rerollBackoff, streak - 1);
    return Math.min(hours, PARAMS.rerollMaxDays * 24) * HOUR;
  }

  function suppression(L, now) {
    if (L.lastRerollAt && now - L.lastRerollAt < rerollCooldownMs(L)) return 0;
    let s = 1;
    if (L.lastAttemptAt && now - L.lastAttemptAt < PARAMS.attemptCooldownHours * HOUR && !(L.lastContactAt >= L.lastAttemptAt)) s *= 0.05;
    if (L.lastShownAt) {
      const d = Math.max(0, (now - L.lastShownAt) / DAY);
      s *= 1 - PARAMS.shownSuppression * Math.exp(-d / PARAMS.shownRecoveryDays);
    }
    return s;
  }

  function topOfMind(L) {
    return clamp((1 + PARAMS.topOfMindStep * (L.wouldNot || 0)) / (1 + PARAMS.topOfMindStep * (L.wouldHave || 0)), PARAMS.topOfMindFloor, 1);
  }

  function weight(person, L, now) {
    if (!person || !person.eligible || L.hidden || L.business) return 0;
    const { p } = probability(person, L);
    const r = recencyFactor(L, now).f;
    const s = suppression(L, now);
    const rw = L.rel ? (PARAMS.relationWeight[L.rel] || 1) : 1;
    return Math.pow(p, PARAMS.sharpness) * r * s * rw * topOfMind(L);
  }

  function isUncertain(person, L) {
    return L.shown === 0 && !L.rel && L.pos === 0 && L.neg === 0 &&
      person.prior >= PARAMS.exploreMinPrior && person.prior <= PARAMS.exploreMaxPrior;
  }

  // ---------------------------------------------------------------- spinning
  /**
   * Pick someone. Returns { id, mode, spinId } or null when nobody is eligible.
   * opts: { now, rng, exclude: [ids], record: true, fun: false }. A fun spin only changes the animation, never who is picked;
   * it is marked so the stats can count it.
   */
  function spin(state, opts) {
    const o = opts || {};
    const now = o.now || Date.now();
    const rng = o.rng || Math.random;
    const exclude = new Set(o.exclude || []);
    const main = [];
    const explore = [];
    let mainTotal = 0;
    let exploreTotal = 0;
    for (const id of Object.keys(state.people)) {
      if (exclude.has(id)) continue;
      const person = state.people[id];
      const L = state.learn[id] || newLearn();
      const w = weight(person, L, now);
      if (!(w > 0)) continue;
      main.push([id, w]);
      mainTotal += w;
      if (isUncertain(person, L)) {
        const we = person.prior * suppression(L, now);
        if (we > 0) { explore.push([id, we]); exploreTotal += we; }
      }
    }
    if (!main.length) return null;
    const rate = state.settings && typeof state.settings.exploration === 'number' ? state.settings.exploration : PARAMS.exploration;
    let mode = 'main';
    let pool = main;
    let total = mainTotal;
    if (explore.length && rng() < rate) { mode = 'explore'; pool = explore; total = exploreTotal; }
    let r = rng() * total;
    let pick = pool[pool.length - 1][0];
    for (const [id, w] of pool) {
      r -= w;
      if (r <= 0) { pick = id; break; }
    }
    const spinId = ++state.seq;
    if (o.record !== false) {
      const L = learnOf(state, pick);
      L.shown++;
      L.lastShownAt = now;
      const e = { t: now, k: 'show', id: pick, s: spinId };
      if (mode === 'explore') e.m = 1;
      if (o.fun) e.f = 1;
      logEvent(state, e);
    }
    return { id: pick, mode, spinId };
  }

  const ACTIONS = ['reroll', 'call', 'talked', 'noAnswer', 'notCalled', 'wouldHave', 'wouldNot', 'spokeWeek', 'spokeMonth',
    'friend', 'family', 'work', 'business', 'unbusiness', 'hide', 'unhide'];

  function markContact(L, at) {
    if (!(L.lastContactAt >= at)) L.lastContactAt = at;
    L.contacts.push(at);
    L.contacts.sort((a, b) => a - b);
    if (L.contacts.length > 60) L.contacts.splice(0, L.contacts.length - 60);
  }

  /** Record what the person did. opts: { now, spinId, outcome } (outcome: 'talked' | 'noAnswer', for the would-question) */
  function act(state, id, action, opts) {
    if (!ACTIONS.includes(action)) throw new Error('Unknown action: ' + action);
    const o = opts || {};
    const now = o.now || Date.now();
    const L = learnOf(state, id);
    const e = { t: now, k: action, id };
    if (o.spinId) e.s = o.spinId;
    switch (action) {
      case 'reroll': L.rerolls++; L.notNow = (L.notNow || 0) + 1; L.neg += PARAMS.rerollEvidence; L.lastRerollAt = now; break;
      case 'call':
        if (state.pending && state.pending.id === id && state.pending.s === (o.spinId || 0)) return L; // same call, tapped twice
        L.calls++; L.notNow = 0; L.pos += PARAMS.callEvidence; L.lastAttemptAt = now; state.pending = { id, at: now, s: o.spinId || 0 };
        break;
      case 'talked': L.talked++; L.notNow = 0; L.pos += PARAMS.talkedEvidence; markContact(L, now); state.pending = null; break;
      case 'noAnswer': L.noAnswer++; state.pending = null; break;
      case 'notCalled':
        if (L.calls > 0) { L.calls--; L.pos = Math.max(0, L.pos - PARAMS.callEvidence); }
        L.lastAttemptAt = 0;
        state.pending = null;
        break;
      case 'wouldHave': L.wouldHave++; if (o.outcome) e.v = o.outcome; break;
      case 'wouldNot': L.wouldNot++; if (o.outcome) e.v = o.outcome; break;
      case 'spokeWeek': markContact(L, now - PARAMS.spokeWeekDaysAgo * DAY); L.notNow = 0; L.pos += PARAMS.spokeEvidence; break;
      case 'spokeMonth': markContact(L, now - PARAMS.spokeMonthDaysAgo * DAY); L.notNow = 0; L.pos += PARAMS.spokeEvidence; break;
      case 'friend':
      case 'family':
      case 'work': L.rel = L.rel === action ? '' : action; e.v = L.rel; break;
      case 'business': L.business = true; break;
      case 'unbusiness': L.business = false; break;
      case 'hide': L.hidden = true; break;
      case 'unhide': L.hidden = false; break;
      default: break;
    }
    logEvent(state, e);
    return L;
  }

  // ---------------------------------------------------------------- explanations
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function roughDays(d) {
    if (d < 1.5) return '1 day';
    if (d < 13.5) return Math.round(d) + ' days';
    if (d < 60) return plural(Math.round(d / 7), 'week');
    return plural(Math.round(d / 30.4), 'month');
  }

  /** Why someone came up, in plain words, plus the numbers behind it. */
  function explain(state, id, now, mode) {
    const t = now || Date.now();
    const person = state.people[id];
    const L = state.learn[id] || newLearn();
    const { p, observations } = probability(person, L);
    const rec = recencyFactor(L, t);
    const lines = [];
    if (mode === 'explore') lines.push('Trying someone new. I don’t know much about them yet.');
    if (L.rel) lines.push({ family: 'Family', friend: 'Friend', work: 'Work' }[L.rel]);
    if (rec.known) {
      const usual = rec.cadenceLearned ? ', usually every ' + roughDays(rec.cadence) : '';
      lines.push(rec.days < 0.75 ? 'Talked today' + usual : 'Last talked about ' + roughDays(rec.days) + ' ago' + usual);
    }
    if (L.talked) lines.push('Talked ' + plural(L.talked, 'time') + ' through the app');
    if (mode !== 'explore' && lines.length < 2) {
      const positives = (person.reasons || []).filter((r) => r.w >= 0.6).slice(0, 2).map((r) => r.text);
      if (positives.length) lines.push(positives.join(' · '));
      else if (!lines.length) lines.push('Picked by chance from your contacts');
    }
    return {
      lines,
      probability: p,
      confidence: observations < 1 ? 'new' : observations < 4 ? 'some' : 'good',
      cadenceDays: cadenceDays(L).days,
      daysSinceContact: rec.known ? rec.days : null,
      weight: weight(person, L, t),
    };
  }

  // ---------------------------------------------------------------- lists for the page
  function eligibleCount(state) {
    let n = 0;
    for (const [id, p] of Object.entries(state.people)) {
      const L = state.learn[id];
      if (p.eligible && !(L && (L.hidden || L.business))) n++;
    }
    return n;
  }

  function hiddenPeople(state) {
    const out = [];
    for (const [id, L] of Object.entries(state.learn)) {
      const p = state.people[id];
      if (p && (L.hidden || L.business)) out.push({ id, name: p.name, why: L.business ? 'business' : 'hidden' });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Random plausible names for the spin animation (not recorded). */
  function sampleNames(state, n, rng) {
    const r = rng || Math.random;
    const pool = Object.values(state.people).filter((p) => p.eligible && p.prior >= 0.3 && !p.nameFromNumber);
    const out = [];
    for (let i = 0; i < n && pool.length; i++) out.push(pool[Math.floor(r() * pool.length)].name);
    return out;
  }

  // ---------------------------------------------------------------- stats
  function stats(state, opts) {
    const o = opts || {};
    const now = o.now || Date.now();
    const days = o.days === undefined ? 14 : o.days;
    return Object.assign({ days }, statsBetween(state, days ? now - days * DAY : 0, now));
  }

  /** The first spin: the start of the two-week test. 0 if nothing yet. */
  function testStart(state) {
    for (const e of state.events) if (e.k === 'show') return e.t;
    return 0;
  }

  /** Week i (0-based) of the test, counted from the first spin. null if it hasn't started. */
  function weekStats(state, start, i, t) {
    const from = start + i * 7 * DAY;
    if (from > t) return null;
    const s = statsBetween(state, from, Math.min(t, from + 7 * DAY - 1));
    return { activeDays: s.activeDays, callDays: s.callDays, firstThreeDays: s.firstThreeDays, spins: s.spins, calls: s.calls, spinsPerCall: s.spinsPerCall, wouldNotHave: s.wouldNotHave };
  }

  /** Week 1 against week 2 of the test: is it getting better? */
  function trend(state, now) {
    const start = testStart(state);
    if (!start) return null;
    const t = now || Date.now();
    return { start, week1: weekStats(state, start, 0, t), week2: weekStats(state, start, 1, t) };
  }

  /** Every week since the first spin (up to 12), so a longer test shows whether use holds up after the novelty. */
  function weekly(state, now) {
    const start = testStart(state);
    if (!start) return [];
    const t = now || Date.now();
    const n = Math.min(12, Math.floor((t - start) / (7 * DAY)) + 1);
    const out = [];
    for (let i = 0; i < n; i++) out.push(Object.assign({ week: i + 1 }, weekStats(state, start, i, t)));
    return out;
  }

  /**
   * Picks and corrections grouped by day-one signal, since the first spin: which kinds of contact get called,
   * spun past or tagged. Counts by signal code only, never names or label names. People without any signal count as "none".
   * people, business, dontSuggest and friendFamily describe the contact book now; shown, called and spunAgain count events.
   */
  function signalStats(state) {
    const rows = {};
    const row = (code) => rows[code] || (rows[code] = { people: 0, shown: 0, called: 0, spunAgain: 0, business: 0, dontSuggest: 0, friendFamily: 0 });
    const codesOf = (p) => (p.signals && p.signals.length ? p.signals : ['none']);
    for (const [id, p] of Object.entries(state.people)) {
      if (!p.eligible) continue;
      const L = state.learn[id];
      for (const c of codesOf(p)) {
        const r = row(c);
        r.people++;
        if (L && L.business) r.business++;
        if (L && L.hidden) r.dontSuggest++;
        if (L && (L.rel === 'friend' || L.rel === 'family')) r.friendFamily++;
      }
    }
    const undone = new Set(state.events.filter((e) => e.k === 'notCalled' && e.s).map((e) => e.s));
    const field = { show: 'shown', call: 'called', reroll: 'spunAgain' };
    for (const e of state.events) {
      const f = field[e.k];
      const p = f && state.people[e.id];
      if (!p || (e.k === 'call' && e.s && undone.has(e.s))) continue;
      for (const c of codesOf(p)) row(c)[f]++;
    }
    const ordered = {};
    for (const code of SIGNALS.concat('none')) if (rows[code]) ordered[code] = rows[code];
    return ordered;
  }

  /** The blueprint's Phase 1 gate, asked of the person: would you spin again tomorrow? value: 'yes' | 'unsure' | 'no' */
  function recordVerdict(state, value, now) {
    if (!['yes', 'unsure', 'no'].includes(value)) throw new Error('Unknown verdict: ' + value);
    logEvent(state, { t: now || Date.now(), k: 'verdict', v: value });
  }

  function latestVerdict(state, until) {
    for (let i = state.events.length - 1; i >= 0; i--) {
      const e = state.events[i];
      if (e.k === 'verdict' && (!until || e.t <= until)) return e.v;
    }
    return null;
  }

  /** Forget what was learned (tags, hidden people, evidence). Keeps contacts and history. */
  function resetLearning(state, now) {
    state.learn = {};
    state.pending = null;
    logEvent(state, { t: now || Date.now(), k: 'resetLearning' });
  }

  function markReminderAdded(state, now) {
    state.settings.reminderAddedAt = now || Date.now();
  }

  function markBackup(state, now) {
    state.settings.lastBackupAt = now || Date.now();
  }

  function statsBetween(state, from, to) {
    const now = to;
    const ev = state.events.filter((e) => e.t >= from && e.t <= now);
    const count = (k) => ev.filter((e) => e.k === k).length;
    const undone = new Set(ev.filter((e) => e.k === 'notCalled' && e.s).map((e) => e.s));
    const calledSpins = new Set(ev.filter((e) => e.k === 'call' && e.s && !undone.has(e.s)).map((e) => e.s));
    const byDay = new Map();
    for (const e of ev) {
      if (e.k !== 'show') continue;
      const d = dayKey(e.t);
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(e);
    }
    let firstThreeDays = 0;
    for (const shows of byDay.values()) {
      if (shows.slice(0, 3).some((e) => calledSpins.has(e.s))) firstThreeDays++;
    }
    const shows = ev.filter((e) => e.k === 'show');
    const calls = count('call') - count('notCalled');
    // Seconds from opening the spin to tapping Call: how quickly the app gets out of the way. A sitting starts with
    // the first spin after a 30-minute break; the median keeps one call made hours later from skewing it.
    const toCall = [];
    let sittingStart = 0;
    let lastShow = 0;
    for (const e of ev) {
      if (e.k === 'show') {
        if (!lastShow || e.t - lastShow > 30 * 60000) sittingStart = e.t;
        lastShow = e.t;
      } else if (e.k === 'call' && sittingStart && !undone.has(e.s)) toCall.push((e.t - sittingStart) / 1000);
    }
    const callDays = new Set(ev.filter((e) => e.k === 'call' && !undone.has(e.s)).map((e) => dayKey(e.t))).size;
    return {
      activeDays: byDay.size,
      callDays,
      spins: shows.length,
      explorationSpins: shows.filter((e) => e.m).length,
      explorationCalls: (function () { const ex = new Set(shows.filter((e) => e.m).map((e) => e.s)); return [...calledSpins].filter((s) => ex.has(s)).length; })(),
      funSpins: shows.filter((e) => e.f).length,
      funCalls: (function () { const fun = new Set(shows.filter((e) => e.f).map((e) => e.s)); return [...calledSpins].filter((s) => fun.has(s)).length; })(),
      calls,
      talked: count('talked'),
      noAnswer: count('noAnswer'),
      wouldNotHave: count('wouldNot'),
      wouldNotTalked: ev.filter((e) => e.k === 'wouldNot' && e.v !== 'noAnswer').length,
      wouldHave: count('wouldHave'),
      verdict: latestVerdict(state, now),
      rerolls: count('reroll'),
      firstThreeDays,
      spinsPerCall: calls ? Math.round((shows.length / calls) * 10) / 10 : null,
      secondsToCall: toCall.length ? Math.round(median(toCall)) : null,
      peopleShown: new Set(shows.map((e) => e.id)).size,
      peopleCalled: new Set(ev.filter((e) => e.k === 'call' && !undone.has(e.s)).map((e) => e.id)).size,
      tags: {
        spokeWeek: count('spokeWeek'), spokeMonth: count('spokeMonth'), friend: count('friend'), family: count('family'),
        work: count('work'), business: count('business'), hide: count('hide'),
      },
    };
  }

  function sizeBucket(n) {
    if (n < 100) return 'under 100';
    if (n < 300) return '100–299';
    if (n < 700) return '300–699';
    if (n < 1500) return '700–1,499';
    return '1,500+';
  }

  /** Counts only: no names, numbers or ids. Safe for a tester to send. */
  function shareableStats(state, now) {
    const t = now || Date.now();
    const strip = (s) => {
      const o = Object.assign({}, s);
      delete o.days;
      return o;
    };
    return {
      app: 'Keep in Touch',
      engine: VERSION,
      date: new Date(t).toISOString().slice(0, 10),
      contactBook: sizeBucket(Object.keys(state.people).length),
      canComeUp: sizeBucket(eligibleCount(state)),
      last14Days: strip(stats(state, { now: t, days: 14 })),
      allTime: strip(stats(state, { now: t, days: 0 })),
      trend: (function () {
        const tr = trend(state, t);
        return tr ? { start: new Date(tr.start).toISOString().slice(0, 10), week1: tr.week1, week2: tr.week2 } : null;
      })(),
      weeks: weekly(state, t),
      bySignal: signalStats(state),
      // yes/no only: did they tap "Add to calendar" on this device (an iPhone that added it from Safari shows no)
      reminderAdded: !!(state.settings && state.settings.reminderAddedAt),
      // which spin they chose for every day (Settings): a style name, nothing personal
      everydaySpin: (state.settings && state.settings.everyday) || 'reel',
    };
  }

  /** The same counts as one message a tester can paste into WhatsApp or an email. */
  function shareableText(state, now, appVersion) {
    const sh = shareableStats(state, now);
    const verdictWord = { yes: 'Yes', unsure: 'Not sure', no: 'No' };
    const line = (s) => 'used ' + plural(s.activeDays, 'day') + ' · ' + plural(s.spins, 'spin') + ' · ' + plural(s.calls, 'call') +
      ' · ' + s.wouldNotHave + ' wouldn’t have happened otherwise (' + plural(s.wouldNotTalked, 'conversation') + ')' +
      ' · a call from the first 3 spins on ' + plural(s.firstThreeDays, 'day');
    const out = ['Keep in Touch stats, ' + sh.date + ' (v' + (appVersion || '?') + ', engine ' + VERSION + ')'];
    if (!sh.trend) return out.concat('No spins yet.').join('\n');
    out.push('Since the first spin on ' + sh.trend.start + ': ' + line(sh.allTime) +
      (sh.allTime.verdict ? ' · spin again tomorrow: ' + verdictWord[sh.allTime.verdict] : ''));
    out.push('Last 14 days: ' + line(sh.last14Days));
    out.push('Someone new to try: ' + plural(sh.allTime.explorationSpins, 'spin') + ', ' + plural(sh.allTime.explorationCalls, 'call'));
    out.push('Everyday spin: ' + sh.everydaySpin + ' · fun spins: ' + sh.allTime.funSpins + ', calls from them: ' + sh.allTime.funCalls);
    if (sh.allTime.secondsToCall !== null) out.push('Seconds from first spin to Call (median): ' + sh.allTime.secondsToCall);
    out.push('By week (days used · calls · wouldn’t have happened): ' +
      sh.weeks.map((w) => 'w' + w.week + ' ' + w.activeDays + '·' + w.calls + '·' + w.wouldNotHave).join(' | '));
    out.push('Reminder added to a calendar: ' + (sh.reminderAdded ? 'yes' : 'no'));
    out.push('Contacts: ' + sh.contactBook + ', can come up: ' + sh.canComeUp);
    out.push('By day-one signal (people · shown · called · spun again · business · don’t suggest · friend or family):');
    for (const [code, r] of Object.entries(sh.bySignal)) {
      if (r.shown || r.business || r.dontSuggest || r.friendFamily) {
        out.push(code + ' ' + [r.people, r.shown, r.called, r.spunAgain, r.business, r.dontSuggest, r.friendFamily].join('·'));
      }
    }
    return out.join('\n');
  }

  // ---------------------------------------------------------------- saving and loading
  // Saving keeps only source data. Everything derived (day-one guess, reasons, number types, eligibility)
  // is recomputed on load, so a saved file stays small and engine improvements apply to old data.
  function compactPerson(p) {
    const o = { name: p.name };
    for (const k of ['fnRaw', 'given', 'family', 'nickname', 'org', 'title']) if (p[k]) o[k] = p[k];
    if (p.categories && p.categories.length) o.categories = p.categories;
    if (p.emails && p.emails.length) o.emails = p.emails;
    for (const k of ['bday', 'events', 'hasPhoto', 'nameFromNumber']) if (p[k]) o[k] = 1;
    if (p.related) o.related = p.related;
    if (p.sources > 1) o.sources = p.sources;
    o.numbers = (p.numbers || []).map((n) => {
      const x = { raw: n.raw };
      if (n.types && n.types.length) x.types = n.types;
      if (n.label) x.label = n.label;
      if (n.pref) x.pref = 1;
      return x;
    });
    return o;
  }

  function expandPerson(id, o) {
    const numbers = (o.numbers || []).map((n) => classifyNumber({ raw: n.raw, types: n.types || [], label: n.label || '', pref: !!n.pref }));
    const p = {
      id, name: o.name || '', fnRaw: o.fnRaw || '', given: o.given || '', family: o.family || '', nickname: o.nickname || '',
      org: o.org || '', title: o.title || '', categories: o.categories || [], emails: o.emails || [],
      bday: !!o.bday, events: !!o.events, related: o.related || 0, hasPhoto: !!o.hasPhoto,
      nameFromNumber: !!o.nameFromNumber, sources: o.sources || 1, numbers,
    };
    p.best = bestNumberIndex(numbers);
    const pr = dayOnePrior(p);
    p.prior = pr.prob;
    p.reasons = pr.reasons;
    p.signals = pr.signals;
    p.ineligible = baseIneligibility(p);
    p.eligible = !p.ineligible;
    return p;
  }

  function compactLearn(L) {
    const d = newLearn();
    const o = {};
    for (const k of Object.keys(L)) {
      if (k === 'contacts') { if (L.contacts && L.contacts.length) o.contacts = L.contacts; continue; }
      if (L[k] !== d[k]) o[k] = L[k];
    }
    return o;
  }

  function serialize(state) {
    const people = {};
    for (const [id, p] of Object.entries(state.people)) people[id] = compactPerson(p);
    const learn = {};
    for (const [id, L] of Object.entries(state.learn)) {
      const c = compactLearn(L);
      if (Object.keys(c).length) learn[id] = c;
    }
    return JSON.stringify(Object.assign({}, state, { schema: SCHEMA, engine: VERSION, people, learn }));
  }

  function deserialize(text) {
    const s = typeof text === 'string' ? JSON.parse(text) : text;
    if (!s || s.app !== 'keep-in-touch' || typeof s.people !== 'object' || typeof s.learn !== 'object' || !Array.isArray(s.events)) {
      throw new Error('This file is not a Keep in Touch backup.');
    }
    if (s.schema > SCHEMA) throw new Error('This backup comes from a newer version of Keep in Touch.');
    const people = {};
    for (const [id, o] of Object.entries(s.people)) people[id] = expandPerson(id, o);
    s.people = people;
    s.schema = SCHEMA;
    const d = defaultSettings();
    s.settings = Object.assign(d, s.settings || {});
    s.settings.reminder = Object.assign(defaultSettings().reminder, (s.settings && s.settings.reminder) || {});
    s.seq = s.seq || s.events.reduce((m, e) => Math.max(m, e.s || 0), 0);
    for (const id of Object.keys(s.learn)) s.learn[id] = Object.assign(newLearn(), s.learn[id]);
    return s;
  }

  return {
    VERSION, SCHEMA, PARAMS, KEYWORDS, SIGNALS,
    createState, importCards, buildPeople, classifyNumber, classifyLabels, dayOnePrior,
    spin, act, explain, stats, statsBetween, trend, weekly, signalStats, testStart, recordVerdict, latestVerdict, resetLearning, markBackup, markReminderAdded, defaultSettings,
    shareableStats, shareableText, eligibleCount, hiddenPeople, sampleNames,
    probability, weight, cadenceDays, recencyFactor, suppression, topOfMind, learnOf,
    serialize, deserialize, mulberry32, dayKey,
  };
});
