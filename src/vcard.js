/*
 * Keep in Touch v0: contacts-file (vCard) reader.
 *
 * Reads .vcf exports from Google Contacts (vCard 3.0), Android phones (vCard 2.1, often
 * quoted-printable, which is how accented and non-Latin names usually arrive), iPhone/iCloud (3.0 with grouped
 * labels) and vCard 4.0. No network, no dependencies; runs in browsers and in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KITVcard = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function toLines(text) {
    return String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  }

  // Index of the colon that separates "NAME;PARAMS" from the value (ignoring colons in quotes).
  function valueColon(line) {
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') quoted = !quoted;
      else if (c === ':' && !quoted) return i;
    }
    return -1;
  }

  function isQuotedPrintableHead(head) {
    return /ENCODING=QUOTED-PRINTABLE|;QUOTED-PRINTABLE(;|$)/i.test(head);
  }

  // RFC 2425/6350 folding: a line starting with a space or tab continues the previous line.
  // vCard 2.1 quoted-printable: a value ending in "=" continues on the next physical line.
  function unfold(text) {
    const raw = toLines(text);
    const folded = [];
    for (const line of raw) {
      if ((line[0] === ' ' || line[0] === '\t') && folded.length) folded[folded.length - 1] += line.slice(1);
      else folded.push(line);
    }
    const out = [];
    for (let i = 0; i < folded.length; i++) {
      let line = folded[i];
      const colon = valueColon(line);
      if (colon > 0 && isQuotedPrintableHead(line.slice(0, colon))) {
        while (line.endsWith('=') && i + 1 < folded.length) line = line.slice(0, -1) + folded[++i];
      }
      out.push(line);
    }
    return out;
  }

  function splitOutsideQuotes(s, sep) {
    const parts = [];
    let cur = '';
    let quoted = false;
    for (const c of s) {
      if (c === '"') { quoted = !quoted; cur += c; }
      else if (c === sep && !quoted) { parts.push(cur); cur = ''; }
      else cur += c;
    }
    parts.push(cur);
    return parts;
  }

  function decodeQuotedPrintable(s, charset) {
    const bytes = [];
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
        bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
        i += 2;
      } else if (code < 128) {
        bytes.push(code);
      } else {
        const cp = s.codePointAt(i);
        for (const b of new TextEncoder().encode(String.fromCodePoint(cp))) bytes.push(b);
        if (cp > 0xffff) i++;
      }
    }
    let label = String(charset || 'utf-8').trim().toLowerCase();
    if (label === 'utf8') label = 'utf-8';
    try {
      return new TextDecoder(label).decode(new Uint8Array(bytes));
    } catch (e) {
      return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    }
  }

  function unescapeText(s) {
    return String(s).replace(/\\(.)/g, (m, c) => (c === 'n' || c === 'N' ? '\n' : c));
  }

  // Split on unescaped separators (";" for N/ORG, "," for CATEGORIES), then unescape each part.
  function splitEscaped(value, sep) {
    const out = [];
    let cur = '';
    for (let i = 0; i < value.length; i++) {
      const c = value[i];
      if (c === '\\' && i + 1 < value.length) { cur += c + value[i + 1]; i++; }
      else if (c === sep) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(unescapeText);
  }

  function parseLine(line) {
    const colon = valueColon(line);
    if (colon <= 0) return null;
    const head = splitOutsideQuotes(line.slice(0, colon), ';');
    let value = line.slice(colon + 1);
    let name = head[0].trim();
    let group = '';
    const dot = name.lastIndexOf('.');
    if (dot >= 0) { group = name.slice(0, dot).toLowerCase(); name = name.slice(dot + 1); }
    name = name.toUpperCase();
    const params = {};
    const types = [];
    for (let i = 1; i < head.length; i++) {
      const p = head[i].trim();
      if (!p) continue;
      const eq = p.indexOf('=');
      if (eq < 0) { types.push(p.toUpperCase()); continue; } // vCard 2.1 bare types: TEL;CELL;PREF:
      const key = p.slice(0, eq).trim().toUpperCase();
      const val = p.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
      if (key === 'TYPE') val.split(',').forEach((t) => { if (t.trim()) types.push(t.trim().toUpperCase()); });
      else params[key] = val;
    }
    let encoding = (params.ENCODING || '').toUpperCase();
    if (!encoding && types.includes('QUOTED-PRINTABLE')) encoding = 'QUOTED-PRINTABLE';
    if (!encoding && types.includes('BASE64')) encoding = 'BASE64';
    let binary = false;
    if (encoding === 'QUOTED-PRINTABLE') value = decodeQuotedPrintable(value, params.CHARSET);
    else if (encoding === 'B' || encoding === 'BASE64') { binary = value.length > 0; value = ''; }
    return { group, name, params, types, value, binary };
  }

  function cleanLabel(s) {
    return String(s || '').replace(/^_\$!<(.*)>!\$_$/, '$1').trim();
  }

  function emptyCard() {
    return {
      version: '', fn: '', given: '', family: '', middle: '', prefix: '', suffix: '',
      nickname: '', org: '', orgUnit: '', title: '',
      tels: [], emails: [], categories: [], related: [],
      bday: false, events: false, hasPhoto: false, uid: '', note: '',
      groupLabels: {},
    };
  }

  function addProp(card, p) {
    const v = p.value;
    switch (p.name) {
      case 'VERSION': card.version = v.trim(); break;
      case 'FN': card.fn = unescapeText(v).trim(); break;
      case 'N': {
        const c = splitEscaped(v, ';').map((x) => x.trim());
        card.family = c[0] || ''; card.given = c[1] || ''; card.middle = c[2] || '';
        card.prefix = c[3] || ''; card.suffix = c[4] || '';
        break;
      }
      case 'NICKNAME': if (v.trim()) card.nickname = unescapeText(v).trim(); break;
      case 'ORG': {
        const c = splitEscaped(v, ';').map((x) => x.trim()).filter(Boolean);
        if (c[0]) card.org = c[0];
        if (c[1]) card.orgUnit = c[1];
        break;
      }
      case 'TITLE':
      case 'ROLE': if (v.trim()) card.title = unescapeText(v).trim(); break;
      case 'TEL': {
        let num = unescapeText(v).trim();
        if (/^tel:/i.test(num)) num = num.slice(4);
        num = num.split(';')[0].trim(); // drop URI parameters such as ;ext=
        if (num) card.tels.push({ raw: num, types: p.types.slice(), group: p.group, pref: p.types.includes('PREF') || !!p.params.PREF, label: '' });
        break;
      }
      case 'EMAIL': if (v.trim()) card.emails.push(unescapeText(v).trim().toLowerCase()); break;
      case 'CATEGORIES':
        splitEscaped(v, ',').map((x) => x.trim()).filter(Boolean).forEach((x) => card.categories.push(x));
        break;
      case 'BDAY': if (v.trim()) card.bday = true; break;
      case 'ANNIVERSARY':
      case 'X-ANNIVERSARY':
      case 'X-ABDATE': if (v.trim()) card.events = true; break;
      case 'X-ABRELATEDNAMES':
      case 'RELATED':
        if (v.trim()) card.related.push({ name: unescapeText(v).trim(), group: p.group, label: '' });
        break;
      case 'PHOTO': if (p.binary || v.trim()) card.hasPhoto = true; break;
      case 'UID': card.uid = v.trim(); break;
      case 'NOTE': card.note = unescapeText(v).trim(); break;
      case 'X-ABLABEL': if (p.group) card.groupLabels[p.group] = cleanLabel(unescapeText(v)); break;
      case 'X-ANDROID-CUSTOM': {
        const c = splitEscaped(v, ';');
        const kind = (c[0] || '').toLowerCase();
        if (kind.endsWith('/nickname') && c[1] && c[1].trim()) card.nickname = c[1].trim();
        else if (kind.endsWith('/relation') && c[1] && c[1].trim()) card.related.push({ name: c[1].trim(), group: '', label: '' });
        else if (kind.endsWith('/contact_event') && c[1] && c[1].trim()) card.events = true;
        break;
      }
      default: break;
    }
  }

  function displayName(card) {
    if (card.fn) return card.fn;
    const parts = [card.prefix, card.given, card.middle, card.family, card.suffix].filter(Boolean);
    if (parts.length) return parts.join(' ');
    if (card.nickname) return card.nickname;
    if (card.org) return card.org;
    if (card.tels.length) return card.tels[0].raw;
    if (card.emails.length) return card.emails[0];
    return '';
  }

  function finishCard(card) {
    for (const t of card.tels) {
      const label = t.group && card.groupLabels[t.group];
      if (label) { t.label = label; t.types.push(label.toUpperCase()); }
    }
    for (const r of card.related) {
      if (r.group && card.groupLabels[r.group]) r.label = card.groupLabels[r.group];
    }
    card.name = displayName(card);
    card.nameFromNumber = !card.fn && !card.given && !card.family && !card.nickname && !card.org && card.tels.length > 0;
    delete card.groupLabels;
    return card;
  }

  /** Parse a .vcf file's text. Returns { cards, unfinished } where unfinished counts cards missing END:VCARD. */
  function parse(text) {
    const cards = [];
    let cur = null;
    let unfinished = 0;
    for (const line of unfold(text)) {
      if (!line.trim()) continue;
      if (/^BEGIN:VCARD\s*$/i.test(line.trim())) {
        if (cur) { unfinished++; cards.push(finishCard(cur)); }
        cur = emptyCard();
        continue;
      }
      if (/^END:VCARD\s*$/i.test(line.trim())) {
        if (cur) cards.push(finishCard(cur));
        cur = null;
        continue;
      }
      if (!cur) continue;
      const p = parseLine(line);
      if (p) addProp(cur, p);
    }
    if (cur) { unfinished++; cards.push(finishCard(cur)); }
    return { cards, unfinished };
  }

  return { parse, unfold, parseLine, decodeQuotedPrintable, splitEscaped, unescapeText };
});
