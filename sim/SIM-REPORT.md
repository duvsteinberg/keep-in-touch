# Keep in Touch v0: simulation report

> Generated 2026-10-12 by `sim/simulate.js` (engine 0.1.8, 100 random seeds per row, 28 days, 105 s). Day-one figures carry about ±6 points of noise.
> Blueprint Phase 1: does the engine turn a messy contact book into reasonable picks from day one, and does it improve with use?

## How to read this

Fake contact books were written as real .vcf files (Google-style vCard 3.0, plus Android-style quoted-printable), with duplicates, businesses, service numbers, entries without numbers, numbers saved without a name, people saved by trade ("Avi Plumber"), old contacts and coworkers. They went through the same reader and engine as the page. Simulated people used the app once a day: they call people worth calling who are due, reroll the rest, and (in some rows) use the quick tags. Family and close friends also get calls outside the app that the app never sees.

**Limit:** the fake books carry the same kinds of signals the engine looks for, so this proves the mechanics and the edge cases, not real-world quality. Your own contact book is the real test.

Personal = family, close friends, friends, acquaintances. Glad to call = family, close friends, friends. Bad = businesses and people saved by trade. Early = days 1–3. Late = days 15–28.

## Day one: engine vs. a plain random pick

Steady user, no tags.

| Contacts | Picker | First spin personal | First spin bad | Glad-to-call in first 3 spins |
|---:|---|---:|---:|---:|
| 50 | Engine | 65% | 5% | 70% |
| 50 | Random | 41% | 10% | 47% |
| 200 | Engine | 69% | 5% | 71% |
| 200 | Random | 39% | 14% | 47% |
| 500 | Engine | 68% | 5% | 76% |
| 500 | Random | 37% | 14% | 49% |
| 1,000 | Engine | 70% | 4% | 77% |
| 1,000 | Random | 41% | 15% | 50% |
| 2,000 | Engine | 66% | 5% | 74% |
| 2,000 | Random | 39% | 14% | 47% |

## Four weeks of use

| Contacts | User | First spin personal, early → late | First spin bad, early → late | Glad-to-call in first 3, early → late | Calls / week | Conversations / week | Calls that wouldn’t have happened / week (of which talked) | Spins per call | Bad share of all spins | Close people seen in 4 weeks |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 50 | steady, uses tags | 68% → 65% | 4% → 4% | 75% → 69% | 4.1 | 3.0 | 3.0 (2.1) | 5.6 | 5% | 95% |
| 50 | steady, no tags | 65% → 53% | 5% → 7% | 70% → 57% | 4.0 | 2.8 | 2.9 (2.0) | 5.8 | 6% | 95% |
| 50 | on and off, no tags | 73% → 57% | 4% → 6% | 76% → 61% | 2.6 | 1.8 | 1.9 (1.3) | 5.2 | 6% | 90% |
| 200 | steady, uses tags | 70% → 66% | 5% → 5% | 69% → 72% | 4.7 | 3.3 | 3.3 (2.4) | 4.4 | 4% | 64% |
| 200 | steady, no tags | 69% → 66% | 5% → 4% | 71% → 68% | 4.6 | 3.1 | 3.3 (2.2) | 4.6 | 5% | 64% |
| 200 | on and off, no tags | 70% → 66% | 4% → 4% | 72% → 70% | 2.8 | 1.9 | 1.9 (1.3) | 4.4 | 5% | 43% |
| 500 | steady, uses tags | 68% → 69% | 4% → 4% | 79% → 73% | 4.6 | 3.3 | 3.1 (2.2) | 4.5 | 5% | 32% |
| 500 | steady, no tags | 68% → 67% | 5% → 5% | 76% → 72% | 4.7 | 3.3 | 3.4 (2.3) | 4.4 | 5% | 31% |
| 500 | on and off, no tags | 69% → 67% | 5% → 3% | 77% → 76% | 2.9 | 1.9 | 1.9 (1.3) | 4.5 | 4% | 20% |
| 1,000 | steady, uses tags | 69% → 67% | 3% → 4% | 76% → 73% | 4.8 | 3.4 | 3.3 (2.3) | 4.2 | 4% | 17% |
| 1,000 | steady, no tags | 70% → 66% | 4% → 5% | 77% → 75% | 4.7 | 3.3 | 3.3 (2.3) | 4.4 | 4% | 17% |
| 1,000 | on and off, no tags | 73% → 70% | 6% → 4% | 78% → 76% | 2.8 | 1.9 | 2.0 (1.3) | 4.4 | 4% | 11% |
| 2,000 | steady, uses tags | 70% → 70% | 5% → 3% | 73% → 77% | 4.7 | 3.3 | 3.2 (2.3) | 4.5 | 4% | 9% |
| 2,000 | steady, no tags | 66% → 69% | 5% → 4% | 74% → 76% | 4.8 | 3.4 | 3.2 (2.4) | 4.4 | 4% | 9% |
| 2,000 | on and off, no tags | 70% → 67% | 5% → 5% | 71% → 74% | 2.8 | 1.9 | 1.9 (1.3) | 4.5 | 4% | 5% |

## Import check

| Contacts written | Cards read | People after merging | Duplicates merged | No number | Service numbers | Can come up | Look like businesses | Look personal |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 50 | 54 | 52 | 2 | 2 | 2 | 48 | 10 | 20 |
| 200 | 207 | 200 | 7 | 8 | 6 | 186 | 34 | 74 |
| 500 | 518 | 500 | 18 | 20 | 15 | 465 | 94 | 192 |
| 1,000 | 1032 | 1000 | 32 | 40 | 30 | 930 | 192 | 349 |
| 2,000 | 2081 | 2000 | 81 | 80 | 60 | 1860 | 378 | 682 |

## Tuning check (500 contacts, steady user, no tags)

How sharply the engine favors likely-personal contacts (sharpness) and how often it tries someone unknown (exploration). Defaults: sharpness 3, exploration 0.2.

| Sharpness | Exploration | First spin personal, early → late | First spin bad, early | Glad-to-call in first 3, early → late | Calls that wouldn’t have happened / week | Spins per call | Close people seen in 4 weeks |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.1 | 63% → 59% | 7% | 66% → 61% | 3.2 | 5.4 | 26% |
| 1 | 0.2 | 61% → 60% | 8% | 66% → 59% | 3.2 | 5.6 | 25% |
| 1 | 0.3 | 62% → 57% | 7% | 65% → 59% | 3.1 | 5.9 | 26% |
| 2 | 0.1 | 66% → 66% | 4% | 73% → 69% | 3.2 | 4.9 | 30% |
| 2 | 0.2 | 64% → 62% | 3% | 70% → 65% | 3.2 | 5.1 | 29% |
| 2 | 0.3 | 63% → 61% | 3% | 69% → 66% | 3.1 | 5.1 | 29% |
| 3 | 0.1 | 69% → 69% | 3% | 78% → 75% | 3.3 | 4.4 | 33% |
| 3 | 0.2 | 68% → 67% | 5% | 76% → 72% | 3.4 | 4.4 | 31% |
| 3 | 0.3 | 65% → 66% | 5% | 76% → 70% | 3.2 | 4.6 | 30% |

## v0 bar (my proposal)

Day one should not feel random or broken: first spin personal ≥ 65%, first spin bad ≤ 8%, and someone glad-to-call within the first three spins on ≥ 60% of days.

| Contacts | User | Result |
|---:|---|---|
| 50 | steady, uses tags | Pass |
| 50 | steady, no tags | Pass |
| 50 | on and off, no tags | Pass |
| 200 | steady, uses tags | Pass |
| 200 | steady, no tags | Pass |
| 200 | on and off, no tags | Pass |
| 500 | steady, uses tags | Pass |
| 500 | steady, no tags | Pass |
| 500 | on and off, no tags | Pass |
| 1,000 | steady, uses tags | Pass |
| 1,000 | steady, no tags | Pass |
| 1,000 | on and off, no tags | Pass |
| 2,000 | steady, uses tags | Pass |
| 2,000 | steady, no tags | Pass |
| 2,000 | on and off, no tags | Pass |
