# Changelog

What changed in each version of Keep in Touch, newest first. Releases: https://github.com/duvsteinberg/keep-in-touch/releases

## v0.1.4 · 2026-10-12

- **Your spin (Settings):** choose your everyday spin from nine styles: reel, orbit, deal, departure board, spotlight, classic dial, telephone, tuner and prize wheel. The big Spin plays it every time. Share my stats names the one you chose.
- **Prize wheel:** a game-show wheel with first names on colored slices and a clicker on top that ticks past each peg, slows down and stops on today's person.
- **Fun spin:** press and hold Spin or Spin again (or right-click) for a fun spin. It plays one of the other styles inside the card, each once before any repeats, and nothing else on the screen changes. It picks exactly like a regular spin.
- **Spin again is quick** (a short reel), except that the first spin of a day always plays your everyday spin in full.
- **After a spin, the card scrolls to the top** (name, number, Call, Spin again); the big Spin stays above.
- **English only:** example contacts, keyword lists, labels, tests and docs are English, with general words only.
- **Engine 0.1.6–0.1.8:** fun spins and the everyday spin are counted in Share my stats; the word lists keep to general English, and in-laws count as family.
- The automatic app check now plays every spin style on both phones and waits for each to land.

## v0.1.3 · 2026-10-12

- **The reel replaces the rotary dial.** Names stream up through the whole card, slow down, and today's person lands on the name line.
- **Engine 0.1.5:** more keyword rules: wig shops, hotlines, landlords, therapists by job title and more now read as services. General words only, no names.
- **Shared stats** say yes or no to whether the daily reminder was added.
- `main` is protected: changes arrive only through a pull request with a green check.

## v0.1.2 · 2026-10-12 (went live with v0.1.3)

- **Reminder tied to a moment** ("After dinner: who are you calling today?"), and **Add to Apple Calendar** on iPhone.
- **Spin again is quick** (0.4 s) after the first spin of the day.
- "People usually appreciate a call more than we expect." on "Someone new to try" picks.
- **Privacy the browser enforces** (Content-Security-Policy), and fresh files on every update.
- **Engine 0.1.4:** seconds from the first spin to tapping Call, in shared stats.

## v0.1.1 · 2026-10-12

- Tags only label; spinning is always your tap.
- Share my stats covers a four-week test: week by week, calls from someone new, picks by kind of contact.
- Sturdier import with progress for big files.
- **Engine 0.1.3:** each "not now" in a row keeps someone out longer.
- Automatic checks on every change, on an emulated Android phone and iPhone.

## v0.1.0 · 2026-10-12

- First daily-use version: installable, works offline, brings in a `.vcf` contacts file, learns from taps, two-week checkpoint, backups.
