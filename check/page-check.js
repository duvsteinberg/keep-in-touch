// One functional pass over the built app, served over http like GitHub Pages, on an emulated phone:
// Android in Chrome by default, or an iPhone in Safari's engine with KIT_PHONE=iphone.
// Run after `node build.js`:  node check/page-check.js
const path = require('path');
const http = require('http');
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/npm-tools/node_modules/playwright'); }
const { devices } = pw;
const iphone = process.env.KIT_PHONE === 'iphone';
const engine = iphone ? pw.webkit : pw.chromium;
const root = path.resolve(__dirname, '..');
const shots = path.resolve(__dirname, 'shots');
fs.mkdirSync(shots, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (cond, msg) => { results.push((cond ? 'PASS ' : 'FAIL ') + msg); };
let browser = null;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json', '.vcf': 'text/vcard' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
// "No signal" = the site can't be reached at all: stop the server, then start it again on the same port.
const sockets = new Set();
server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
const serverDown = () => new Promise((r) => { server.close(() => r()); for (const s of sockets) s.destroy(); });
const serverUp = (port) => new Promise((r) => server.listen(port, '127.0.0.1', r));

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  browser = await engine.launch();
  const phone = devices[iphone ? 'iPhone 14' : 'Pixel 7'];
  results.push('on ' + (iphone ? 'iPhone 14 (WebKit)' : 'Pixel 7 (Chromium)'));
  const ctx = await browser.newContext({ ...phone, acceptDownloads: true, colorScheme: 'light' });
  const page = await ctx.newPage();
  const errors = [];
  const foreign = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.includes('csp-test.invalid')) foreign.push(u); });

  await page.goto(base);
  await sleep(500);

  // installability basics
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const res = await fetch(link.href);
    return { status: res.status, json: await res.json() };
  });
  ok(manifest.status === 200 && manifest.json.display === 'standalone' && manifest.json.orientation === 'any' && manifest.json.icons.some((i) => i.sizes === '512x512') && manifest.json.icons.some((i) => i.purpose === 'maskable'),
    'manifest: standalone, turns with the phone, 192/512 and maskable icons');
  // the browser enforces "nothing leaves your phone": anything from another address is refused before it's requested
  const errorsBefore = errors.length;
  const csp = await page.evaluate(() => new Promise((resolve) => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    let blocked = 0;
    document.addEventListener('securitypolicyviolation', () => { blocked++; });
    const img = new Image();
    img.src = 'https://csp-test.invalid/pixel.png';
    try { const s = document.createElement('script'); s.textContent = 'window.__injected = 1'; document.body.appendChild(s); } catch (e) {}
    setTimeout(() => resolve({ meta: !!meta && /default-src 'none'/.test(meta.content), blocked, injected: !!window.__injected }), 400);
  }));
  ok(csp.meta && csp.blocked >= 2 && !csp.injected, 'the browser blocks other addresses and any script that isn’t the app’s own');
  await sleep(200);
  errors.splice(errorsBefore); // those two refusals were this test's own; anything after counts
  const swReady = await page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; return !!reg.active; });
  ok(swReady, 'service worker installs and activates');
  await page.reload();
  await sleep(500);
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page after reload');

  // example mode and the call flow, including the would-question after "No answer"
  ok(await page.isVisible('#banner') && (await page.textContent('#banner')).includes('example contacts'), 'example banner on first open');
  ok(await page.isVisible('#card'), 'an example pick shows on first open');
  await page.click('#call');
  await sleep(100);
  await page.click('[data-action="noAnswer"]');
  ok(await page.isVisible('#act-would'), 'after "No answer" it still asks whether you would have called anyway');
  await page.click('[data-action="wouldNot"]');
  ok((await page.textContent('#done-msg')).includes('You still reached out'), 'an unanswered call you would not otherwise have made still counts');

  // bring in contacts
  await page.click('#banner [data-go="import"]');
  await page.setInputFiles('#file-vcf', { name: 'notes.vcf', mimeType: 'text/vcard', buffer: Buffer.from('just some notes, no contacts') });
  await sleep(300);
  ok((await page.textContent('#import-result')).includes('No contacts found') && (await page.textContent('#banner')).includes('example contacts'),
    'a file without contacts says so and changes nothing');
  await page.setInputFiles('#file-vcf', path.resolve(__dirname, 'contacts.vcf'));
  await sleep(300);
  const summary = (await page.textContent('#import-result')).replace(/\s+/g, ' ');
  ok(summary.includes('Your contacts are in') && /Contacts read\s*12/.test(summary) && /Duplicates merged\s*1/.test(summary), 'imports the Google-style file (12 read, 1 duplicate merged)');
  await page.click('#import-result [data-go="spin"]');
  ok((await page.textContent('#saved-line')).startsWith('Saved on this device'), 'shows "Saved on this device"');

  // a day of use: the first spin of the day plays the everyday spin in full (the prize wheel for a new user),
  // and the clicker stops on the slice of the person who lands on the card
  await page.click('#dial');
  await sleep(300);
  const wheel = await page.evaluate(() => { const fx = document.querySelector('#card .fx'); return { kind: fx ? fx.getAttribute('data-spin') : 'none', hidden: document.getElementById('card').classList.contains('spinning') }; });
  // the name it reports is the slice under the clicker, worked out from how far the wheel actually turned
  const stoppedOn = await page.waitForFunction(() => {
    const l = document.querySelector('#card .fx .w-label.on'), layer = document.querySelector('#card .fx .w-layer');
    if (!l || !layer) return false;
    const segs = [...layer.querySelectorAll('.w-seg')], k = segs.findIndex((x) => x.classList.contains('on'));
    const deg = parseFloat((/rotate\(([-\d.]+)deg\)/.exec(layer.style.transform) || [])[1]);
    const under = Math.floor(((360 - (deg % 360)) % 360) / (360 / segs.length));
    return l.textContent + (under === k ? '' : ' (but the clicker is on slice ' + under + ')');
  }, null, { timeout: 3300, polling: 30 }).then((h) => h.jsonValue(), () => '');
  await page.waitForFunction(() => !document.querySelector('#card .fx'), null, { timeout: 3300, polling: 50 }).catch(() => {});
  const first = (await page.textContent('#pname')).trim();
  ok(first.length > 1, 'spin picks someone: ' + first);
  ok(wheel.kind === 'wheel' && wheel.hidden && !!stoppedOn && first.startsWith(stoppedOn.replace('…', '')) && !(await page.$('#card .fx')),
    'a new user’s first spin plays the prize wheel, and the clicker stops on the pick (' + stoppedOn + ')');
  await page.click('[data-tag="family"]');
  ok((await page.textContent('#pname')).trim() === first && (await page.getAttribute('[data-tag="family"]', 'aria-pressed')) === 'true', 'Family labels without respinning');
  await page.click('[data-tag="family"]');
  await page.click('[data-tag="spokeWeek"]');
  ok((await page.textContent('#pname')).trim() === first && await page.isVisible('#call') && (await page.getAttribute('[data-tag="spokeWeek"]', 'aria-pressed')) === 'true',
    'Spoke this week labels without respinning; Call and Spin again stay');
  await page.click('#toast-undo');
  ok((await page.getAttribute('[data-tag="spokeWeek"]', 'aria-pressed')) === 'false', 'Undo takes the label back');
  const callHref = await page.getAttribute('#call', 'href');
  ok(/^tel:\+?\d{9,}$/.test(callHref), 'Call opens the phone dialer: ' + callHref);
  await page.evaluate(() => { const a = document.getElementById('call'); a.setAttribute('data-href', a.getAttribute('href')); a.setAttribute('href', '#'); });
  await page.click('#call');
  await page.click('[data-action="talked"]');
  await page.click('[data-action="wouldNot"]');
  ok((await page.textContent('#done-msg')).includes('wouldn’t have happened'), 'a conversation that would not have happened is recorded');

  // persistence across a restart
  await page.reload();
  await sleep(500);
  ok(!(await page.textContent('#banner')).includes('example contacts'), 'after a restart your contacts are still there');
  await page.click('.tab[data-go="history"]');
  ok((await page.textContent('#history-body')).includes('Talked with'), 'history keeps the call after a restart');

  // offline: the site can't be reached, so the page has to come from the app's own cache
  const port = server.address().port;
  await serverDown();
  try {
    await page.reload();
    await sleep(500);
    ok(await page.isVisible('#dial'), 'opens with no signal');
    await page.click('.tab[data-go="spin"]');
    await page.click('#dial');
    await sleep(2000);
    ok((await page.textContent('#pname')).trim().length > 1, 'spins with no signal');
  } catch (e) {
    ok(false, 'opens and spins with no signal: ' + String(e.message).split('\n')[0]);
  }
  await serverUp(port);
  if (!(await page.isVisible('#dial').catch(() => false))) { await page.goto(base); await sleep(500); }
  await page.click('.tab[data-go="spin"]');
  if (!(await page.isVisible('#card'))) { await page.click('#dial'); await sleep(2000); }

  // after Business, Spin again is a new spin, not a "not now" for someone already explained
  const tagged = (await page.textContent('#pname')).trim();
  await page.click('[data-tag="business"]');
  ok((await page.textContent('#pname')).trim() === tagged && await page.isVisible('#call'), 'Business labels without respinning');
  const kinds = () => page.evaluate(() => JSON.parse(localStorage.getItem('kit.v0.state')).events.map((e) => e.k));
  const before = (await kinds()).length;
  await page.click('[data-action="reroll"]');
  await sleep(2000);
  const added = (await kinds()).slice(before);
  ok(added.length === 1 && added[0] === 'show', 'Spin again after Business records a new spin only: ' + added.join(', '));

  // after the first spin of the day, Spin again plays the everyday spin quickly; the "appreciate a call" line only shows on someone new
  // (each "Spin again" sets that person aside for a day, so the small test book runs out after a few)
  let quickOk = true, nudgeOk = true, explored = 0, spins = 0, slowest = 0;
  const quickKinds = new Set();
  for (let i = 0; i < 5; i++) {
    // timed inside the page, from the tap until the card is back, so the test tool's own delays don't count
    const { k, ms } = await page.evaluate(() => new Promise((resolve) => {
      const b = document.querySelector('[data-action="reroll"]');
      if (!b) { resolve({ k: 'none', ms: 0 }); return; }
      const t0 = performance.now();
      let k = 'none';
      b.click();
      (function poll() {
        const fx = document.querySelector('#card .fx');
        if (fx && k === 'none') k = fx.getAttribute('data-spin') + ' ' + fx.getAttribute('data-style');
        const c = document.getElementById('card');
        if (!c || !c.classList.contains('spinning') || performance.now() - t0 > 2500) { resolve({ k, ms: performance.now() - t0 }); return; }
        setTimeout(poll, 15);
      })();
    }));
    if (await page.isVisible('#empty')) break;
    spins++;
    slowest = Math.max(slowest, ms);
    quickKinds.add(k);
    if (!(await page.isVisible('#act-picked'))) quickOk = false;
    const isNew = (await page.textContent('#eyebrow')).trim() === 'Someone new to try';
    if (isNew) explored++;
    if (isNew !== (await page.isVisible('#nudge'))) nudgeOk = false;
  }
  ok(quickOk && spins >= 2 && slowest < 1500 && [...quickKinds].every((k) => k === 'quick wheel'),
    'Spin again after the first spin of the day plays the everyday spin quickly: ' + [...quickKinds].join(', ') + ', slowest ' + (slowest / 1000).toFixed(2) + ' s (' + spins + ' spins)');
  ok(nudgeOk, '"People usually appreciate a call" shows on someone new to try, and only there (' + explored + ' of ' + spins + ' were someone new)');

  // settings: reminder, backup, test checkpoint, verdict, reset learning
  await page.click('.tab[data-go="settings"]');
  const remHref = await page.getAttribute('#rem-add', 'href');
  ok(remHref.startsWith('https://calendar.google.com/calendar/render?') && remHref.includes('recur=RRULE%3AFREQ%3DWEEKLY%3BBYDAY%3DSU%2CMO%2CTU%2CWE%2CTH') && remHref.includes('ctz='),
    'reminder link: weekly, Sunday to Thursday, with time zone');
  await page.click('[data-day="5"]');
  ok((await page.getAttribute('#rem-add', 'href')).includes('TH%2CFR'), 'tapping Fri adds Friday to the reminder');
  await page.click('[data-day="5"]');
  await page.fill('#rem-time', '19:30');
  await page.dispatchEvent('#rem-time', 'change');
  ok((await page.textContent('#rem-time-label')).trim() === '7:30 p.m.' && (await page.getAttribute('#rem-add', 'href')).includes('T193000'), 'reminder time shows as 7:30 p.m. and goes into the link');
  const googleText = async () => new URL(await page.getAttribute('#rem-add', 'href')).searchParams.get('text');
  await page.click('[data-moment="Morning coffee"]');
  ok((await page.inputValue('#rem-time')) === '08:00' && (await page.textContent('#rem-preview')).includes('Morning coffee: who are you calling today?') &&
    (await googleText()) === 'Morning coffee: who are you calling today?' && (await page.getAttribute('#rem-add', 'href')).includes('T080000'),
    'a moment sets its usual time and goes into the reminder');
  await page.click('[data-moment-own]');
  await page.fill('#rem-own', 'After lunch');
  ok((await page.textContent('#rem-preview')).includes('After lunch: who are you calling today?') && (await googleText()) === 'After lunch: who are you calling today?',
    'your own moment goes into the reminder');
  await page.reload();
  await sleep(500);
  await page.click('.tab[data-go="settings"]');
  ok((await page.inputValue('#rem-own')) === 'After lunch' && (await page.inputValue('#rem-time')) === '08:00', 'the reminder is still set after a restart');
  if (iphone) {
    const [icsFile] = await Promise.all([page.waitForEvent('download', { timeout: 3000 }).catch(() => null), page.click('#rem-ics')]);
    const ics = { href: await page.getAttribute('#rem-ics', 'href'), download: icsFile ? icsFile.suggestedFilename() : '', text: icsFile ? fs.readFileSync(await icsFile.path(), 'utf8') : '' };
    const lines = ics.text.split('\r\n').filter(Boolean);
    ok(ics.href.startsWith('blob:') && /\.ics$/.test(ics.download) && ics.text.includes('RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH') &&
      ics.text.includes('SUMMARY:After lunch: who are you calling today?') && ics.text.includes('BEGIN:VALARM') && /DTSTART:\d{8}T080000\r\n/.test(ics.text) &&
      lines.every((l) => Buffer.byteLength(l) <= 75),
      'Add to Apple Calendar makes a weekly calendar file on the phone, with an alert');
  } else {
    ok(!(await page.$('#rem-ics')), 'no Apple Calendar button on Android');
  }
  await page.click('[data-moment=""]');
  ok((await googleText()) === 'Who are you calling today?', '"Just a time" goes back to the plain reminder');
  // tapping "Add to Google Calendar" (kept on this page here) is counted, yes or no, for Share my stats
  await page.evaluate(() => { const a = document.getElementById('rem-add'); a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 3000 }).catch(() => null), page.click('#settings-body [data-backup]')]);
  ok(!!dl, 'Save a backup downloads a file' + (dl ? ': ' + dl.suggestedFilename() : ''));
  await sleep(200);
  ok((await page.textContent('#settings-body')).includes('Last backup:'), 'settings shows when you last backed up');
  await page.screenshot({ path: shots + '/' + (iphone ? 'iphone-' : '') + 'v01-settings.png', fullPage: true });

  await page.click('#settings-body [data-go="test"]');
  await page.click('[data-verdict="yes"]');
  await sleep(100);
  ok((await page.getAttribute('[data-verdict="yes"]', 'aria-pressed')) === 'true', '"Would you spin again tomorrow?" records an answer');
  const testText = await page.textContent('#test-body');
  ok(/Calls you wouldn’t have made otherwise/.test(testText) && /Is it getting better\?/.test(testText) && /Week 1/.test(testText) && /Day \d+ of 28/.test(await page.textContent('#test-sub')) &&
    !/suggested|two weeks|of 14/i.test(testText), 'the test screen counts four weeks, shows the North Star week by week and the verdict, and sets no target');
  const shareText = await page.textContent('#share-text');
  ok(shareText.includes('spin again tomorrow: Yes'), 'the shareable summary includes the verdict');
  ok(shareText.includes('Reminder added to a calendar: yes') && /Seconds from first spin to Call \(median\): \d+/.test(shareText), 'the shareable summary says the reminder was added, and the seconds to Call');
  ok(/Since the first spin/.test(shareText) && /By week/.test(shareText) && /By day-one signal/.test(shareText), 'the shareable summary covers the whole test, week by week and by signal');
  const leaked = ['Rachel', 'Josh', 'Carter', 'Mom', 'Dana', 'Pizza', 'Steve', 'Sarah', 'David', 'José', 'Friends', '050', '052'].filter((w) => shareText.includes(w));
  ok(leaked.length === 0, 'the shareable summary has no names, labels or numbers' + (leaked.length ? ': ' + leaked.join(', ') : ''));
  const wa = await page.getAttribute('#share-wa', 'href'), mail = await page.getAttribute('#share-mail', 'href');
  const waText = wa.startsWith('https://wa.me/?text=') ? decodeURIComponent(wa.slice('https://wa.me/?text='.length)) : '';
  const mailBody = mail.startsWith('mailto:?subject=Keep%20in%20Touch%20stats&body=') ? decodeURIComponent(mail.split('&body=')[1]).replace(/\r\n/g, '\n') : '';
  ok(waText === shareText && mailBody === shareText && (await page.getAttribute('#share-wa', 'target')) === '_blank',
    'Send by WhatsApp and Send by email open with the same summary filled in, and no one chosen for you');
  await page.screenshot({ path: shots + '/' + (iphone ? 'iphone-' : '') + 'v01-test.png', fullPage: true });

  await page.click('.tab[data-go="settings"]');
  await page.click('#reset-learning');
  await page.click('#reset-learning');
  await sleep(100);
  ok((await page.textContent('#toast-text')).includes('Reset'), 'reset what it learned (two taps), keeping contacts');

  // the big Spin plays your everyday spin (the prize wheel unless you choose another), Spin again plays it quickly;
  // holding plays one of the other styles, inside the card
  await page.click('.tab[data-go="spin"]');
  const hold = async (selector) => { await page.locator(selector).scrollIntoViewIfNeeded(); const b = await page.locator(selector).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await sleep(650); await page.mouse.up(); };
  // A spin "lands" when its layer is gone by itself. The app clears a stuck layer after 4 s, so the wait stops
  // short of that (a hold starts its spin about 0.17 s before the hold ends). The pacing stays at 2.6 s or more,
  // so the next tap isn't read as the end of a hold.
  const spinKind = async (selector, at, held) => {
    if (held) await hold(selector); else await page.click(selector);
    const t0 = Date.now();
    await sleep(at);
    const seen = await page.evaluate(() => {
      const fx = document.querySelector('#card .fx');
      const rows = fx ? [...fx.querySelectorAll('.reel-row')] : [];
      const board = fx && fx.querySelector('.board');
      return { kind: fx ? fx.getAttribute('data-spin') + ':' + rows.length : 'none', style: fx ? fx.getAttribute('data-style') : '', landing: rows.length >= 30 ? rows[28].textContent : '',
        noSelect: document.body.classList.contains('no-select'), fits: !board || board.getBoundingClientRect().right <= fx.getBoundingClientRect().right + 1 };
    });
    const gone = await page.waitForFunction(() => !document.querySelector('#card .fx'), null, { timeout: Math.max(100, 3300 - (Date.now() - t0)), polling: 50 }).then(() => true, () => false);
    const secs = ((Date.now() - t0) / 1000 + (held ? 0.17 : 0)).toFixed(1);
    await sleep(Math.max(0, 2600 - (Date.now() - t0)));
    const name = (await page.textContent('#pname')).trim();
    const after = await page.evaluate(() => ({ noSelect: document.body.classList.contains('no-select'), selected: String(window.getSelection()) }));
    return { kind: seen.kind, style: seen.style, landing: seen.landing, name, secs, landed: gone && name.length > 1, guarded: seen.noSelect && !after.noSelect && !after.selected, fits: seen.fits };
  };
  const timed = (r, name) => name + ' ' + r.secs + ' s' + (r.landed ? '' : ' (did not land)');
  const fulls = [await spinKind('#dial', 300), await spinKind('#dial', 300)];
  ok(fulls.every((r) => r.kind.startsWith('wheel') && r.landed), 'the big Spin plays the everyday spin in full every time: ' + fulls.map((r) => r.kind).join(', '));
  const quick = await spinKind('[data-action="reroll"]', 150);
  ok(/^quick:/.test(quick.kind) && quick.style === 'wheel' && quick.landed, 'Spin again plays the everyday spin quickly: ' + quick.kind + ' ' + quick.style);
  const funs = [];
  for (let i = 0; i < 3; i++) funs.push(await spinKind('#dial', 0, true));
  funs.push(await spinKind('[data-action="reroll"]', 0, true));
  const styles = funs.map((r) => r.kind.split(':')[0]);
  ok(new Set(styles).size === 4 && styles.every((x) => ['reel', 'orbit', 'deal', 'board', 'spotlight', 'classic', 'phone', 'tuner'].includes(x)) && funs.every((r) => r.landed),
    'holding Spin or Spin again plays a fun spin, a different style each time, and lands each time: ' + funs.map((r, i) => timed(r, styles[i])).join(', '));
  ok(fulls.concat([quick], funs).every((r) => r.guarded), 'nothing can be selected while a spin plays, and selecting works again once it lands');
  const funCount = await page.evaluate(() => JSON.parse(localStorage.getItem('kit.v0.state')).events.filter((e) => e.k === 'show' && e.f).length);
  ok(funCount === 4, 'the engine marks the fun spins (' + funCount + ')');
  await page.click('.tab[data-go="settings"]');
  await page.click('#settings-body [data-go="test"]');
  const shared = await page.textContent('#share-text');
  ok(/Everyday spin: wheel · fun spins: 4, calls from them: 0/.test(shared) && /fun spins\): w1 \d+·\d+·\d+·4/.test(shared), 'Share my stats counts the fun spins, in all and week by week');
  // every style, chosen as the everyday spin, plays on a tap and lands by itself (a fresh start each time, so the small book never runs out)
  const everyStyle = [];
  for (const style of ['reel', 'orbit', 'deal', 'board', 'spotlight', 'classic', 'phone', 'tuner', 'wheel']) {
    await page.click('.tab[data-go="settings"]');
    await page.click('#reset-learning'); await page.click('#reset-learning'); await sleep(100);
    await page.click('[data-everyday="' + style + '"]');
    await page.click('.tab[data-go="spin"]');
    const r = await spinKind('#dial', 300);
    everyStyle.push({ style, r, right: r.landed && r.fits && r.kind.startsWith(style === 'reel' ? 'full' : style) && (style !== 'reel' || r.landing === r.name) });
  }
  ok(everyStyle.every((x) => x.right), 'each of the nine styles plays when chosen and lands (the reel on the pick): ' +
    everyStyle.map((x) => timed(x.r, x.style) + (x.r.kind.startsWith(x.style === 'reel' ? 'full' : x.style) ? '' : ' (played ' + x.r.kind + ')')).join(', '));
  await page.click('.tab[data-go="settings"]');
  await page.click('#reset-learning'); await page.click('#reset-learning'); await sleep(100);
  await page.click('[data-everyday="orbit"]');
  ok((await page.getAttribute('[data-everyday="orbit"]', 'aria-checked')) === 'true', 'Settings lets you choose your everyday spin');
  await page.click('.tab[data-go="spin"]');
  const tapOrbit = await spinKind('#dial', 300);
  const againOrbit = await spinKind('[data-action="reroll"]', 100);
  const holdOther = await spinKind('#dial', 0, true);
  ok(tapOrbit.kind.startsWith('orbit') && tapOrbit.landed && againOrbit.kind.startsWith('quick') && againOrbit.style === 'orbit' && againOrbit.landed &&
    !holdOther.kind.startsWith('orbit') && holdOther.landed,
    'with Orbit chosen, Spin plays it, Spin again plays it quickly (' + againOrbit.secs + ' s), and holding plays another (' + holdOther.kind + ')');
  // after a spin the whole card shows above the tabs, scrolled no further than that and with no empty space added below;
  // on a screen too short for the whole card, its top goes to the top
  const where = () => page.evaluate(() => {
    const c = document.getElementById('card').getBoundingClientRect(), tabs = document.querySelector('.tabs').getBoundingClientRect().top;
    return { top: Math.round(c.top), bottom: Math.round(c.bottom), tabs: Math.round(tabs), scrolled: Math.round(scrollY), pad: document.getElementById('view-spin').style.paddingBottom };
  });
  const tall = await where();
  ok(tall.pad === '' && tall.top >= 0 && tall.bottom <= tall.tabs && (tall.scrolled === 0 || tall.tabs - tall.bottom <= 30),
    'after a spin the whole card shows above the tabs, with no empty space below it (card ' + tall.top + '–' + tall.bottom + ' px, tabs at ' + tall.tabs + ', scrolled ' + tall.scrolled + ')');
  const phoneSize = page.viewportSize();
  await page.setViewportSize({ width: phoneSize.width, height: 480 });
  await spinKind('#dial', 300);
  const short = await where();
  await page.setViewportSize(phoneSize);
  ok(short.pad === '' && short.top >= 0 && short.top <= 60 && short.bottom > short.tabs,
    'on a short screen the card goes to the top (card top ' + short.top + ' px, tabs at ' + short.tabs + ')');
  await page.click('.tab[data-go="settings"]');
  await page.click('[data-everyday="reel"]');
  await page.click('.tab[data-go="spin"]');
  await page.click('#dial');
  await sleep(2000);
  await page.screenshot({ path: shots + '/' + (iphone ? 'iphone-' : '') + 'v01-spin-light.png' });
  const dark = await browser.newContext({ ...phone, colorScheme: 'dark' });
  const p2 = await dark.newPage();
  p2.on('pageerror', (e) => errors.push('dark: ' + e.message));
  await p2.goto(base);
  await sleep(500);
  await p2.screenshot({ path: shots + '/' + (iphone ? 'iphone-' : '') + 'v01-first-open-dark.png' });

  // narrow phones
  await page.setViewportSize({ width: 360, height: 740 });
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'no sideways scrolling at 360px');

  ok(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  ok(foreign.length === 0, 'no requests to any other site' + (foreign.length ? ': ' + foreign.join(', ') : ''));
  await browser.close();
  server.close();
  console.log(results.join('\n'));
  if (results.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
})().catch(async (e) => {
  console.log(results.join('\n'));
  console.error('STOPPED ' + String(e.message).split('\n')[0]);
  server.close();
  process.exitCode = 1;
  if (browser) await browser.close().catch(() => {});
});
