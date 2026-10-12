# Keep in Touch: notes for Claude

Read this first in every session, then `README.md` (what the app is) and `ENGINE.md` (how the picking works). What changed in each version is in `CHANGELOG.md`.

## What this is

A small phone web app. You spin, it picks one person from your contacts worth calling today, you call, and it learns from what you tap. The North Star is **calls initiated that wouldn't have happened otherwise** ("Meaningful Connections Initiated"). It is not a CRM, social network, messaging app or dialer, and success is time on the phone, not time in the app.

Live site: GitHub Pages from `main`, folder `/` (root), at https://duvsteinberg.github.io/keep-in-touch/.

## Rules

1. **Privacy comes from how it's built.** The app never sends contacts or history anywhere: no analytics, no third-party scripts, fonts or images, and no network requests except the app's own files. Keep `PRIVACY.md` true. The browser enforces this: `build.js` writes a Content-Security-Policy into `index.html` that allows only the app's own address and only the app's own scripts (by hash). Never loosen it to make something work; if a change needs another address, it needs the maintainer's agreement first.
2. **This repository is public.** Never commit personal data: real names, phone numbers, contact files, backups, private notes, or anything about the maintainer's own life, contacts or plans. Sample and test contacts are invented and generic (the in-app demo uses 555-01xx numbers). `.gitignore` keeps out `.vcf`, `.csv` and `.json` files, and `check/no-personal-data.js` fails any pull request that contains one. Commits are authored `Claude <noreply@anthropic.com>`, never with a personal email.
3. **The product blueprint, decision log and alignment check are kept privately, outside this repo.** Changes must stay aligned with the blueprint; if you can't read it, ask. Anything that touches product scope (new screens, features, metrics or wording of the core flow) gets agreed with the maintainer first.
4. **Don't break saved data.** The storage key is `kit.v0.state`; the backup format is `SCHEMA` in `src/engine.js`. Older backups must keep loading, and a test covers this.
5. **Generated files:** `index.html`, `keep-in-touch.html`, `manifest.webmanifest` and `sw.js` come from `node build.js`. Edit `src/` and rebuild. The service worker's cache name changes with every build, which is how installed apps pick up updates.
6. **Before publishing:** `node build.js && node --test test/test.js`. For page changes also run `node check/fixture.js && node check/page-check.js` (needs Playwright). After engine changes, rerun `node sim/simulate.js` and commit the new `sim/SIM-REPORT.md`. GitHub runs all of these except the simulation on every pull request (`.github/workflows/check.yml`).
7. **Publishing means merging into `main`, and the maintainer decides when.** `main` is protected: changes arrive only through a pull request whose check is green; no direct pushes, force pushes or deletion. Coding sessions work on their own branch. Never ask for a merge on a red X. GitHub Pages redeploys in about a minute, and installed apps pick up the update the next time they're opened online.
8. **One GitHub Pages site on this account.** Browsers keep saved data per address, and every Pages site on the account shares `duvsteinberg.github.io`, so another site's code could read the app's saved contacts. Don't turn on Pages for any other repo of this account. If a second site is ever needed, move this app to its own domain first; saved data then moves by backup and restore.
9. **English only.** The app, its example contacts, keyword lists, tests, simulation, docs and wiki are English. Don't add other languages or scripts unless the maintainer agrees to a separate language setting.
10. **Engine freeze during a tester round:** bug fixes only, so every tester runs the same engine. Tune once afterwards, from all testers' shared stats (picks by day-one signal, week by week), not from one book.
