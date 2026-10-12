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

## What leaves your device

- **Nothing, automatically.**
- **Backups** are files you save yourself. A backup contains everything above, so keep it private.
- **Share my stats** sends nothing by itself. It gives you a summary to copy or a file to save, with counts only: no names, numbers, ids or label names. It counts by kind of contact (for example "starred" or "company field filled in"), never by person. It also says yes or no to whether you added the daily reminder, never its time or wording.
- **Calls:** tapping Call hands the number to your phone's dialer. The app can't see whether the call happened unless you tell it.
- **The daily reminder** opens Google Calendar with a prefilled event, or, for Apple Calendar, makes a calendar file on your phone. Only the reminder’s wording (including a moment you type, such as “After lunch”), its time and days go there, never your contacts.

## Network

The app's own code is served by GitHub Pages, so GitHub sees ordinary web traffic, like any website. After the first visit the app works offline. It loads no third-party scripts, fonts or images.

Your browser enforces this. The page carries a security policy that lets it load and contact only its own address and run only its own code. Anything else is refused before it is requested, including any text in a contacts file that tries to act as code.

## Deleting

- In the app: **Settings → Start over → Erase everything on this device**.
- Clearing this site's data in your browser also deletes it.
- Delete any backup files you saved.
