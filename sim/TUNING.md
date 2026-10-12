# Keep in Touch: engine tuning check

> Run 2026-10-12 by `sim/tune.js` on engine 0.1.2 (before the change below): 100 seeds × 15 book-size/user combinations per setting.
> Every setting ran on the same simulated worlds as the defaults. A change counts only when its 95% margin stays clear of zero (**bold**).
> Rerun with `node sim/tune.js`; it now compares against the new defaults.

## Decision (engine 0.1.3)

- **Adopted: "not now" backoff ×3.** Each "Spin again" on the same person in a row triples how long they sit out (20 h, 2.5 days, 7.5 days, at most 3 weeks); a call or a conversation resets it. It cuts repeat appearances by about 15% and changes nothing else. It also matches the blueprint: a reroll means "not now" more often than "not ever", so repeated rerolls should mean "not soon" without eroding how personal the engine thinks someone is.
- **Not adopted: sharpness 3.5.** It looks better on "glad to call" but does nothing for the North Star (calls that wouldn't have happened): it just favors the family and favorites you'd call anyway. That's optimizing the proxy.
- **Not adopted, on purpose: exploration 0.1.** It helps the sim's efficiency measures, but not the North Star clearly. The sim can't measure what exploration is for: its fake friends and acquaintances carry the same signals, so there's no hidden friend for exploration to find. Research says surprise calls to weaker ties are the most appreciated. Real data decides this: shared stats now count calls that came from "Someone new to try".
- **Not adopted: stronger Spin again (−0.5), "just shown" ×0.1.** Small gains that the backoff already covers, and a stronger reroll penalty contradicts "a reroll is a weak signal".
- **Rejected: sharpness 2.5, day-one guess worth 2 or 5, Spin again −0.2, "just shown" ×0.4.** Worse, or no clear change.

**Limit:** the simulated people follow rules we wrote. This rules settings out and checks mechanics; the testers' shared stats are the real test.

## Defaults (engine 0.1.2)

| Measure | Level |
|---|---:|
| Glad-to-call in first 3, days 1–3 | 76.1% |
| Glad-to-call in first 3, days 15–28 | 70.2% |
| First spin bad, days 1–3 | 3.1% |
| Calls / week | 3.92 |
| Calls that wouldn’t have happened / week | 2.74 |
| Spins per call | 4.86 |
| Bad share of spins | 4.6% |
| Same person again within 3 days | 3.3% |
| Close people seen in 4 weeks | 39.9% |

## Round 1: one setting at a time

Percentage points for percentages. ▲ better, ▼ worse.

| Setting | Glad-to-call in first 3, days 1–3 | Glad-to-call in first 3, days 15–28 | First spin bad, days 1–3 | Calls / week | Calls that wouldn’t have happened / week | Spins per call | Bad share of spins | Same person again within 3 days | Close people seen in 4 weeks |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| not-now backoff ×2 | −0.0 ±0.0 | −0.3 ±0.5 | +0.0 ±0.0 | −0.00 ±0.02 | +0.01 ±0.02 | −0.02 ±0.04 | −0.0 ±0.0 | **−0.4 ±0.1 ▲** | −0.1 ±0.1 |
| not-now backoff ×3 | −0.0 ±0.0 | −0.1 ±0.6 | +0.0 ±0.0 | −0.00 ±0.02 | −0.00 ±0.02 | −0.00 ±0.04 | −0.0 ±0.1 | **−0.5 ±0.1 ▲** | +0.0 ±0.2 |
| not-now backoff ×4 | −0.0 ±0.0 | +0.2 ±0.6 | +0.0 ±0.0 | −0.00 ±0.02 | −0.01 ±0.02 | −0.00 ±0.05 | −0.0 ±0.1 | **−0.8 ±0.1 ▲** | +0.0 ±0.2 |
| exploration 0.1 | **+2.7 ±1.0 ▲** | **+2.4 ±1.0 ▲** | −0.1 ±0.4 | **+0.10 ±0.04 ▲** | **+0.04 ±0.04 ▲** | **−0.25 ±0.07 ▲** | **−0.3 ±0.1 ▲** | **+0.2 ±0.1 ▼** | **+0.4 ±0.3 ▲** |
| exploration 0.15 | **+1.5 ±0.8 ▲** | +0.5 ±0.9 | −0.1 ±0.4 | +0.02 ±0.03 | +0.00 ±0.03 | **−0.10 ±0.06 ▲** | **−0.1 ±0.1 ▲** | **+0.2 ±0.1 ▼** | −0.1 ±0.2 |
| sharpness 2.5 | **−1.9 ±1.6 ▼** | **−2.6 ±1.0 ▼** | +0.2 ±0.7 | −0.04 ±0.04 | +0.04 ±0.04 | **+0.09 ±0.08 ▼** | **+0.2 ±0.1 ▼** | −0.1 ±0.1 | **−0.8 ±0.3 ▼** |
| sharpness 3.5 | **+3.4 ±1.8 ▲** | **+3.0 ±1.0 ▲** | +0.5 ±0.7 | **+0.08 ±0.04 ▲** | +0.01 ±0.04 | **−0.19 ±0.08 ▲** | **−0.3 ±0.1 ▲** | +0.0 ±0.1 | **+0.7 ±0.3 ▲** |
| day-one guess worth 2 | +0.1 ±0.3 | +0.3 ±0.9 | +0.1 ±0.1 | +0.00 ±0.03 | −0.01 ±0.03 | −0.05 ±0.06 | −0.1 ±0.1 | **−0.2 ±0.1 ▲** | +0.1 ±0.3 |
| day-one guess worth 5 | +0.0 ±0.3 | −0.2 ±0.9 | +0.0 ±0.1 | −0.02 ±0.03 | −0.01 ±0.03 | +0.02 ±0.07 | +0.0 ±0.1 | **+0.2 ±0.1 ▼** | −0.2 ±0.3 |
| Spin again −0.2 | −0.0 ±0.3 | −0.1 ±0.9 | +0.0 ±0.1 | +0.00 ±0.03 | +0.01 ±0.03 | −0.05 ±0.06 | −0.0 ±0.1 | **+0.2 ±0.1 ▼** | **−0.3 ±0.3 ▼** |
| Spin again −0.5 | −0.0 ±0.3 | +0.4 ±0.9 | +0.1 ±0.1 | +0.00 ±0.03 | −0.00 ±0.03 | **−0.10 ±0.06 ▲** | −0.1 ±0.1 | **−0.3 ±0.1 ▲** | +0.1 ±0.3 |
| just shown ×0.4, not ×0.2 | +0.1 ±0.4 | −0.1 ±0.9 | −0.0 ±0.2 | +0.00 ±0.03 | −0.01 ±0.04 | +0.00 ±0.07 | −0.0 ±0.1 | **+0.3 ±0.1 ▼** | −0.1 ±0.3 |
| just shown ×0.1, not ×0.2 | +0.0 ±0.3 | −0.1 ±0.8 | +0.1 ±0.1 | +0.02 ±0.03 | +0.03 ±0.03 | **−0.06 ±0.06 ▲** | −0.1 ±0.1 | **−0.3 ±0.1 ▲** | +0.1 ±0.2 |

Worst single book-size/user combination for sharpness 3.5: −4.2 points of glad-to-call in the first 3 spins on days 1–3 (1,000 contacts, on-and-off user).

## Round 2: combinations on top of the backoff

| Setting | Glad-to-call in first 3, days 1–3 | Glad-to-call in first 3, days 15–28 | First spin bad, days 1–3 | Calls / week | Calls that wouldn’t have happened / week | Spins per call | Bad share of spins | Same person again within 3 days | Close people seen in 4 weeks |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| backoff ×3 | −0.0 ±0.0 | −0.1 ±0.6 | +0.0 ±0.0 | −0.00 ±0.02 | −0.00 ±0.02 | −0.00 ±0.04 | −0.0 ±0.1 | **−0.5 ±0.1 ▲** | +0.0 ±0.2 |
| backoff ×3 + exploration 0.15 | **+1.4 ±0.8 ▲** | +0.9 ±0.9 | −0.1 ±0.4 | +0.01 ±0.03 | −0.01 ±0.04 | −0.06 ±0.06 | −0.1 ±0.1 | **−0.4 ±0.1 ▲** | +0.1 ±0.2 |
| backoff ×3 + exploration 0.1 | **+2.7 ±1.0 ▲** | **+2.4 ±1.0 ▲** | −0.1 ±0.4 | **+0.07 ±0.04 ▲** | +0.02 ±0.04 | **−0.20 ±0.07 ▲** | **−0.3 ±0.1 ▲** | **−0.3 ±0.1 ▲** | **+0.5 ±0.3 ▲** |
| backoff ×3 + Spin again −0.5 + just shown ×0.1 | +0.3 ±0.4 | +0.0 ±0.9 | +0.1 ±0.1 | −0.01 ±0.03 | −0.02 ±0.04 | +0.00 ±0.07 | −0.1 ±0.1 | **−0.9 ±0.2 ▲** | **+0.3 ±0.3 ▲** |
| all four | **+2.2 ±1.0 ▲** | **+2.1 ±1.0 ▲** | −0.0 ±0.4 | +0.03 ±0.04 | +0.01 ±0.04 | **−0.15 ±0.08 ▲** | **−0.3 ±0.1 ▲** | **−0.5 ±0.2 ▲** | **+0.5 ±0.3 ▲** |

## How it's measured

- **Same worlds:** each setting runs on identical simulated contact books and people (same seeds) as the defaults, so the paired difference isolates the setting.
- **Margin:** ±1.96 standard errors of the per-seed differences, pooled over all 15 combinations of book size (50 to 2,000) and user (steady with tags, steady without, on and off).
- **Same person again within 3 days:** the share of spins showing someone already shown in the previous three days of use.
