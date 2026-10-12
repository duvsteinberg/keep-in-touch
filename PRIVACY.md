# Privacy

Keep in Touch is built so that your relationships are nobody's data but yours. Privacy comes from how it's built, not from promises: the app has nowhere to send your data.

## What it reads

A contacts file (`.vcf`) that you export and choose yourself. It uses names, phone numbers and a few details already in your contacts (labels such as starred or Family, whether a birthday is saved, a company field) to guess who is personal and who is a business. It cannot read your phone's contacts or call log directly.

## Where it works

Entirely in your browser, on your device. There is no server, no account and no analytics.

## What it keeps

In your browser's storage on your device, for this app only:

- your contacts as read from the file
- what it learned from your taps: calls, spins, tags, hidden people
- a log of spins, calls and tags (the most recent 20,000)
- your settings, such as the reminder time
- whether you've seen the welcome screen
- the last few error messages from the app itself, if any (kept apart from the rest and from backups, for the help report)

## What leaves your device

- **Nothing, automatically.**
- **Backups** are files you save yourself. A backup contains everything above, so keep it private.
- **Share my stats** sends nothing by itself. It gives you a summary to send by WhatsApp or email, copy, or save as a file, with counts only: no names, numbers, ids or label names. **Send by WhatsApp** and **Send by email** open WhatsApp or your email app with the summary filled in; you choose who gets it, and nothing goes until you press send there. (If WhatsApp isn't installed, the link opens WhatsApp's website, which then sees the summary.) It counts by kind of contact (for example "starred" or "company field filled in"), never by person. It also says yes or no to whether you added the daily reminder, never its time or wording.
- **The help report** (Settings → Help and feedback) sends nothing by itself either. **Send by WhatsApp** and **Send by email** open that app with the report filled in, and you choose who gets it. It holds the app's version, your phone's system and browser versions, screen size, dark mode and language, counts (contacts, spins, calls, hidden people), your choices in Settings (which spin, colors, how often to try someone new, whether you added the reminder), when you last made a backup, the last few error messages with anything in quotes and any long number taken out, and whatever you type in "What happened?". The app never adds names, phone numbers, labels or the reminder's wording.
- **Calls:** tapping Call hands the number to your phone's dialer. The app can't see whether the call happened unless you tell it.
- **The daily reminder** opens Google Calendar with a prefilled event, or, for Apple Calendar, makes a calendar file on your phone. Only the reminder’s wording (including a moment you type, such as “After lunch”), its time and days go there, never your contacts.

## Network

The app's own code is served by GitHub Pages, so GitHub sees ordinary web traffic, like any website. After the first visit the app works offline. It loads no third-party scripts, fonts or images.

Your browser enforces this. The page carries a security policy that lets it load and contact only its own address and run only its own code. Anything else is refused before it is requested, including any text in a contacts file that tries to act as code.

## Deleting

- In the app: **Settings → Start over → Erase everything on this device**.
- Clearing this site's data in your browser also deletes it.
- Delete any backup files you saved.
