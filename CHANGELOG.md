# Changelog

What changed in each version of Keep in Touch, newest first. Releases: https://github.com/duvsteinberg/keep-in-touch/releases

## v0.1.6 · 2026-10-12

- **The app turns with the phone.** It used to stay upright when the phone was turned sideways. An app already on the home screen may take a day to pick this up; adding it to the home screen again makes it immediate (your contacts stay, they're kept in the browser).
- **Holding Spin no longer selects text.** While a finger is on a spin button and while a spin plays, nothing on the screen can be selected.
- **One color scheme for all nine spins:** the prize wheel's greens. Green-tinted cards, tiles, faces and slices, the Call green for pointers and the landed letters, the dark only for rims and hubs. In light and dark mode.
- **Smoother spins:**
  - **Prize wheel:** the wheel and the clicker each turn as one ready-drawn picture instead of being redrawn every frame, which caused the stutter. When it lands, the other slices fade toward light instead of turning grey.
  - **Board:** every tile is the same width, so the row no longer jiggles while the letters flip, and long names fit the card (the tiles had picked up the Stats tiles' padding and ran off the edge). The tiles fade before the name rises in their place.
  - **Deal:** the "Your call today" line no longer overlaps the name on the dealt cards.
  - **Spotlight:** the other names now fade away when the highlight stops (they used to stay on screen under the landing card).
  - **Reel:** no more blur (costly on phones); the names stream through a green window on the name line.
  - **Orbit, Spotlight, Prize wheel:** the name leaves its pill smoothly instead of the pill blinking out.
  - **Classic dial:** the finger wheel is one shape with real holes instead of a mask, which is cheaper to turn.
  - **Tuner and Reel:** a steadier slow-down, without the last half second of near-standstill.
- **Share my stats:** **Send by WhatsApp** and **Send by email** open with the summary filled in; you choose who gets it. Copy and Save as a file are still there.
- The engine is unchanged (0.1.9).

## v0.1.5 · 2026-10-12

- **The prize wheel is the everyday spin** for new users, in the app's own greens and greys (light and dark). Anyone can still choose another in Settings → Your spin.
- **Spin again plays your everyday spin,** sped up to under a second, whichever style you chose (it used to be a quick reel for everyone).
- **Your test** (Settings) runs four weeks: day 1 of 28, week by week, with no suggested target on screen.
- **Engine 0.1.9:** Share my stats counts fun spins week by week; the prize wheel is the default. Picks are unchanged.

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
