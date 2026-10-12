# Keep in Touch: the engine

> Engine 0.1.9, updated 2026-10-12. 0.1.9 counts fun spins week by week and makes the prize wheel the default everyday spin (picks unchanged); 0.1.8 keeps the word lists to general English; 0.1.7 is English only and shares the everyday spin; 0.1.6 counts fun spins (picks unchanged); 0.1.5 added more service and family words (below); 0.1.4 added a measure only. The blueprint's Phase 1 deliverable: the relationship engine's spec plus a simulation, independent of the final app.
> Code: `src/engine.js`, `src/vcard.js`. Tests: `test/test.js`. Simulation: `sim/simulate.js`, results in `sim/SIM-REPORT.md`.

## What it answers

- **Day one:** how plausible is it that this contact is a useful person to surface?
- **Over time:** how overdue is this relationship compared with its own normal rhythm?

It never scores how much someone matters. It only decides who is worth showing today.

## How a pick happens

1. **Read the contacts file.** vCard 2.1, 3.0 and 4.0: Google Contacts, Android and iPhone exports, including names encoded the Android way (quoted-printable).
2. **Merge duplicates** that share a phone number. Numbers match on their last 9 digits, so `(212) 555-0123` and `+1 212-555-0123` are the same person.
3. **Who can come up:** anyone with a callable number. Excluded: no number, fax only, service numbers (`*2421`, short codes, 1-700, 1-800 and US toll-free), and anyone you tag **Business** or **Don't suggest**.
4. **Day-one guess** from what's already in the contact (table below). It produces a probability between 2% and 97%.
5. **Learning.** The day-one guess counts as 3 observations. What you do adds evidence on top:

   | You do | Effect |
   |---|---|
   | Call | +1 for "worth surfacing" |
   | We talked | +0.5 more, and records the conversation date |
   | Spoke this week / month | +0.75, and records an approximate date (3.5 / 15 days ago) |
   | Spin again | −0.35. A weak signal: "not now" more often than "not ever" |
   | Family / Friend | +4 / +3, and changes the default rhythm |
   | Work | Stays eligible, weighted ×0.6 |

6. **Recency and rhythm.** If the app has no record of your last conversation, recency is neutral. Missing information is not evidence of distance. After a known conversation, the person is held back by (days since ÷ usual gap)², with a floor of 0.03, until they're due. Once overdue they get a gentle boost, up to ×1.6. The usual gap is the median of known gaps once there are two or more. Until then it uses a default: Family 14 days, Friend 30, Work 60, untagged 45.
7. **Short-term rules.** Spin again: that person sits out for 20 hours. Each further "Spin again" on them in a row triples that (2.5 days, then 7.5 days, never more than 3 weeks), because "not now" again and again means "not soon"; a call, a conversation or "Spoke this week/month" resets it. Spin again right after a tag (Spoke this week/month, Business, Don't suggest) isn't counted as a "not now". A call that didn't connect: ×0.05 for 36 hours, so you can try again in a day or two. Just shown: ×0.2, recovering over about three days.
8. **Top of mind** (an assumption to test). Each "I'd have called them anyway" lowers future nudges for that person (×1/(1 + 0.5n), never below 0.4). Each "No, I wouldn't have" restores it. The app is worth most for the calls that wouldn't happen otherwise.
9. **The pick.** weight = probability³ × recency × short-term rules × tag weight × top of mind. Then a weighted random draw, not the top score. **20% of spins explore:** they draw from people never shown whose day-one guess sits between 12% and 75%, weighted by that guess. That keeps unknown contacts from being written off for lack of data.
10. **Explanation.** Every pick says why: "Starred · Birthday saved", "Trying someone new", "Last talked about 3 weeks ago, usually every 2 weeks".

## Day-one signals

Effects are added in log-odds to a 40% starting guess. The code is how shared stats name the signal (see "What it measures").

| Signal | Code | Effect |
|---|---|---:|
| Starred / favorite | `starred` | +2.2 |
| Family word in the name (Mom, Dad, Grandma, Uncle…), unless the name looks like a business | `familyWord` | +2.0 |
| In a Family label | `familyLabel` | +1.8 |
| In a Friends label | `friendLabel` | +1.5 |
| Birthday saved | `birthday` | +1.0 |
| Relationship saved (mother, sister…) | `relationship` | +0.8 |
| Nickname saved | `nickname` | +0.6 |
| Another date saved (anniversary) | `otherDate` | +0.6 |
| Has a personal mobile number | `mobile` | +0.5 |
| First and last name, unless the "last name" is a trade | `fullName` | +0.4 |
| Has a photo | `photo` | +0.3 |
| In any other custom label | `otherLabel` | +0.3 |
| Personal email (gmail, yahoo, icloud…) | `personalEmail` | +0.2 |
| Job title saved; −1.5 instead when the title is a service (therapist, broker, accountant…) | `jobTitle` | −0.3 |
| Landline only | `landlineOnly` | −0.3 |
| Company field filled in | `companyField` | −0.5 |
| Name mentions work | `workName` | −0.6 |
| In a Work label | `workLabel` | −0.6 |
| Name contains numbers ("Mike camp 2015") | `numbersInName` | −0.6 |
| Only a work or main number | `workNumberOnly` | −0.8 |
| No name saved | `noName` | −1.5 |
| Name includes a job or service (plumber, lawyer, Dr.…) | `jobName` | −2.0 |
| Name looks like a business (Pizza, Ltd, Garage, Clinic…) | `businessName` | −2.2 |
| Saved as a company (company name, no person's name) | `company` | −2.5 |
| In a business label (Vendors, Clients…) | `businessLabel` | −2.5 |

A contact with none of these counts as `none`.

The keyword lists (`KEYWORDS` in `engine.js`) are first drafts, in English. Bad picks from the real test should feed them.

**0.1.5** (general words only, no names): new business words (wig, productions, studios, travels, meals, number, line, hotline, apartment, rentals, sons, brothers…), new service roles (therapist, counselor, coach, tutor, guide, photographer, videographer, editor, writer, caterer, chef…), "Hotline" and "Profession" labels count as business, more family words, and "wife/husband" count as family only as the first word ("John Smith Wife" is someone else's wife).

**0.1.7:** keyword and label lists are English only.

**0.1.8:** the keyword, label and email-provider lists keep to general English words, and in-laws (mother-in-law, father-in-law…) count as family.

## What it measures

- **North Star: calls initiated that wouldn't have happened otherwise.** That's the blueprint's "Meaningful Connections Initiated". After every call, answered or not, the app asks "Would you have called them today without this?" A "No" counts. Conversations are tracked as a subset.
- **The Phase 1 pass mark,** asked of the person: "Would you spin again tomorrow?" The latest answer counts.
- **Is it learning?** Week by week through the four-week test: days used, days that led to a call, a call from the first three spins, spins per call.
- **Does it get out of the way?** Seconds from the first spin of a sitting to tapping Call (median; a sitting starts after a 30-minute break). The constitution wants seconds in the app and a long conversation somewhere else.
- **Everyday spin:** which spin style they use every day (a style name only; the prize wheel unless they chose another in Settings).
- **Fun spins:** how many spins were fun spins, how many calls came from them, and how many fun spins each week (so the stats show whether people who play with spins keep coming back). A fun spin only changes the animation: the pick is exactly the same as a regular spin (a test checks this), so the measures stay comparable.
- **Reminder added:** yes or no, whether they tapped "Add to calendar" on this device. Never the time, wording or days.
- Also: days used, calls, conversations, rerolls, tags used, people called, how often exploration found someone.
- **For tuning across testers' books:** every week since the first spin (does use hold up after the novelty?), and picks by day-one signal: for each signal code, how many people who can come up have it, how often they were shown, called and spun past, and how many are tagged Business, Don't suggest, or Friend/Family. A signal whose people keep getting spun past or tagged Business is weighted wrong. Counts by code only, never names or label names (a test checks this).
- **Share my stats** gives all of this as one message to paste (`shareableText`) or a file (`shareableStats`).

## What the simulation showed

See `sim/SIM-REPORT.md` (100 seeds per row, four weeks, books of 50 to 2,000 contacts, including duplicates, businesses, tradespeople, numbers saved without a name, old contacts and coworkers).

- On day one, against a plain random pick, bad first picks (businesses and tradespeople) fall from 10–17% to 1–6%. Days where someone you'd be glad to call appears in the first three spins rise from about 50% to about 77%.
- Sharpness 3 beat 1 and 2 on almost every measure, so it is the default.
- Every book size and user type passes the v0 bar set before tuning: first spin personal ≥ 65%, first spin bad ≤ 8%, someone glad-to-call in the first three spins on ≥ 60% of days.
- **Limit:** the fake books carry the signals the engine looks for, so this proves mechanics and edge cases, not real quality. Real contact books are the real test.

## What it does not do

- **No call history.** This is Standard Mode in the blueprint: the app learns only from what you tap in it.
- **Day one can't separate an old acquaintance from a current friend** when neither has a star, birthday or label. Learning and the quick tags handle that.
- **A rhythm needs at least two conversations** with the same person before it's learned.
- **No server, no account, no analytics.** Everything lives in the browser on your device, with a backup file.

## What it stores (on the device only)

People from the contacts file, what it has learned per person, a log of spins, calls and tags (the last 20,000 events) and settings. Saving keeps only source data. The day-one guess, reasons, number types and eligibility are recomputed on load, so improvements to the engine apply to existing data. A year of heavy use with 3,000 contacts is about 1 million characters, well inside a phone browser's storage. A backup is that same data as one JSON file. **Share my stats** gives counts only: no names, numbers or ids (a test checks this).

## Changing it

- Constants: `PARAMS` at the top of `src/engine.js`. Keywords: `KEYWORDS` in the same file.
- Run the tests: `node --test test/test.js`
- Run the simulation: `node sim/simulate.js`
- Rebuild the app after any change: `node build.js`
