// Makes the pictures other apps show of Keep in Touch, from the built app with its example contacts (all invented):
//   assets/og-image.jpg        the link preview when someone shares the address (WhatsApp, email…), 1200×630
//   assets/screenshot-N.jpg    the screenshots in Android's install sheet (listed in the manifest by build.js), 824×1830
// Run after `node build.js`, and again whenever the app's look changes:  node check/store-images.js   (needs Playwright)
const path = require('path');
const http = require('http');
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/npm-tools/node_modules/playwright'); }
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'assets');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// The install-sheet screenshots, in order. Each starts on a fresh phone with the example contacts.
const SHOTS = [
  { label: 'Who are you calling today? Your contacts never leave your phone.', run: async () => {} },
  { label: 'Spin, and it picks one person worth a call today', run: async (page) => { await tryExamples(page); await page.click('#dial'); await sleep(1100); } },
  { label: 'Today’s pick, and why they came up', run: async (page) => { await tryExamples(page); await pickWithReason(page); } },
  { label: 'Tell it how it went, and it learns', run: async (page) => {
    await tryExamples(page);
    await page.evaluate(() => { const c = document.getElementById('call'); c.addEventListener('click', (e) => e.preventDefault(), { once: true }); });
    await page.click('#call'); await sleep(200); await page.click('[data-action="talked"]'); await sleep(300);
  } },
];
// The pictures show the app, not the "these are example contacts" note above it.
async function tryExamples(page) { await page.click('[data-welcome="try"]'); await page.addStyleTag({ content: '#banner { display: none !important; }' }); await sleep(300); }
// Spin until the pick shows a real reason (starred, family, a birthday…) rather than "picked by chance".
async function pickWithReason(page) {
  await page.click('#dial'); await sleep(3600);
  for (let i = 0; i < 8 && /chance|someone new/i.test(await page.textContent('#why')); i++) { await page.click('[data-action="reroll"]'); await sleep(1600); }
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await pw.chromium.launch();
  const phone = { ...pw.devices['Pixel 7'], deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'no-preference' };
  const made = [];
  for (let i = 0; i < SHOTS.length; i++) {
    const ctx = await browser.newContext(phone);
    const page = await ctx.newPage();
    await page.goto(base);
    await sleep(2300); // the welcome wheel finishes turning
    await SHOTS[i].run(page);
    const file = path.join(assets, 'screenshot-' + (i + 1) + '.jpg');
    await page.screenshot({ path: file, type: 'jpeg', quality: 86 });
    made.push(path.basename(file) + ' (' + Math.round(fs.statSync(file).size / 1024) + ' KB): ' + SHOTS[i].label);
    await ctx.close();
  }

  // the link preview: the name and the promise on the left, today's pick on a phone on the right
  const pickCtx = await browser.newContext(phone);
  const pickPage = await pickCtx.newPage();
  await pickPage.goto(base); await sleep(2300);
  await tryExamples(pickPage); await pickWithReason(pickPage); await pickPage.evaluate(() => window.scrollTo(0, 0)); await sleep(400);
  const pick = (await pickPage.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 412, height: 760 } })).toString('base64');
  await pickCtx.close();
  const icon = fs.readFileSync(path.join(assets, 'icon.svg'), 'utf8');
  const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await card.setContent(`<!doctype html><html><head><style>
    body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #edf1ee; color: #15211c; font-family: "Segoe UI", system-ui, sans-serif; }
    .left { position: absolute; left: 80px; top: 92px; width: 560px; }
    .icon { width: 96px; height: 96px; border-radius: 22px; overflow: hidden; }
    .icon svg { width: 96px; height: 96px; display: block; }
    .name { margin: 26px 0 0; font: 600 34px "Palatino Linotype", Palatino, Georgia, serif; color: #5a6963; }
    h1 { margin: 6px 0 0; font: 600 64px/1.05 "Palatino Linotype", Palatino, Georgia, serif; }
    p { margin: 22px 0 0; font-size: 26px; line-height: 1.4; color: #3d4a45; }
    .lock { display: inline-block; margin-top: 26px; padding: 10px 18px; border-radius: 14px; background: #d4eadf; font-size: 22px; font-weight: 600; }
    .phone { position: absolute; right: 70px; top: 46px; width: 300px; height: 560px; border-radius: 40px; border: 10px solid #1c2924; overflow: hidden; background: #edf1ee; box-shadow: 0 24px 60px rgb(10 16 14 / 0.25); }
    .phone img { width: 100%; display: block; }
  </style></head><body>
    <div class="left"><div class="icon">${icon}</div><div class="name">Keep in Touch</div><h1>Who are you calling today?</h1>
    <p>Spin, and it picks one person from your contacts worth a call today.</p><div class="lock">Your contacts never leave your phone.</div></div>
    <div class="phone"><img src="data:image/png;base64,${pick}"></div>
  </body></html>`);
  await sleep(300);
  const og = path.join(assets, 'og-image.jpg');
  await card.screenshot({ path: og, type: 'jpeg', quality: 88 });
  made.push('og-image.jpg (' + Math.round(fs.statSync(og).size / 1024) + ' KB): the link preview');
  await browser.close();
  server.close();
  console.log(made.join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });
