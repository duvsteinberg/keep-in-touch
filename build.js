// Keep in Touch: builds the app from src/.
// Writes:
//   index.html, manifest.webmanifest, sw.js   the installable web app (GitHub Pages serves this folder)
//   keep-in-touch.html                        one self-contained file that also works offline from any folder
//   dist/artifact.html                        the same page without the outer document, for a Claude artifact
// Run:  node build.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, text) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), text); };

const app = read('src/app.html');
const vcard = read('src/vcard.js');
const engine = read('src/engine.js');
for (const [name, code] of [['vcard.js', vcard], ['engine.js', engine]]) {
  if (/<\/script/i.test(code)) throw new Error(name + ' contains "</script" and cannot be inlined');
}
if (!app.includes('/*@@VCARD@@*/') || !app.includes('/*@@ENGINE@@*/')) throw new Error('markers missing in src/app.html');
const content = app.replace('/*@@VCARD@@*/', () => '\n' + vcard).replace('/*@@ENGINE@@*/', () => '\n' + engine);

// 1. the artifact version: page content only
write('dist/artifact.html', content);

// 2. full documents: <title> and <style> move into <head>
const m = content.match(/^\s*(<title>[\s\S]*?<\/title>)\s*(<style>[\s\S]*?<\/style>)/);
if (!m) throw new Error('expected <title> then <style> at the top of src/app.html');
const body = content.slice(m[0].length);
const safeArea = '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>';
const doc = (extraHead) => '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  '<meta name="color-scheme" content="light dark">\n' + extraHead +
  m[1] + '\n' + m[2] + '\n' + safeArea + '\n</head>\n<body>' + body + '</body>\n</html>\n';

write('keep-in-touch.html', doc(''));

// The browser itself enforces "nothing leaves your phone": the page may load and contact only its own address.
// Scripts run only if they are exactly the app's own (by hash), so text from a contacts file can never run as code.
// Inline style attributes stay allowed (the meters use them); styles can't send data.
const scriptHashes = [];
body.replace(/<script>([\s\S]*?)<\/script>/g, (all, code) => { scriptHashes.push("'sha256-" + crypto.createHash('sha256').update(code, 'utf8').digest('base64') + "'"); return all; });
if (scriptHashes.length !== 3) throw new Error('expected 3 inline scripts, found ' + scriptHashes.length);
const csp = "default-src 'none'; script-src " + scriptHashes.join(' ') + "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "manifest-src 'self'; connect-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'";
const webHead =
  '<meta http-equiv="Content-Security-Policy" content="' + csp + '">\n' +
  '<meta name="description" content="Spin. Call. Connect. Picks someone from your contacts to call, and keeps everything on your phone.">\n' +
  '<meta name="theme-color" content="#edf1ee" media="(prefers-color-scheme: light)">\n' +
  '<meta name="theme-color" content="#0d1311" media="(prefers-color-scheme: dark)">\n' +
  '<link rel="manifest" href="manifest.webmanifest">\n' +
  '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">\n' +
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n';
const index = doc(webHead);
write('index.html', index);

// 3. the install manifest
write('manifest.webmanifest', JSON.stringify({
  name: 'Keep in Touch',
  short_name: 'Keep in Touch',
  description: 'Spin. Call. Connect. Picks someone from your contacts to call, and keeps everything on your phone.',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#edf1ee',
  theme_color: '#edf1ee',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2) + '\n');

// 4. the offline service worker; its cache name changes whenever the app changes, which triggers an update
const assets = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];
const hash = crypto.createHash('sha256');
hash.update(index);
for (const a of assets.slice(3)) hash.update(fs.readFileSync(path.join(root, a)));
const version = hash.digest('hex').slice(0, 12);
write('sw.js', `// Keep in Touch service worker: keeps the app working without a signal.
// It caches only the app's own files. Your contacts and history live in the browser's storage, never here.
const CACHE = 'kit-${version}';
const ASSETS = ${JSON.stringify(assets)};

// Fetch fresh copies, not the browser's short-term cache, so a new version never stores an older page under its name.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kit-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => (request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
`);

console.log('built index.html (' + Math.round(index.length / 1024) + ' KB), manifest, sw.js (cache ' + version + '), keep-in-touch.html, dist/artifact.html');
