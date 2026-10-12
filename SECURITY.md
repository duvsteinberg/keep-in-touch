# Security

Keep in Touch has no server and no accounts: your contacts and history live only in your phone's browser. That leaves three places where something could go wrong, and they are what we protect:

- **The code that runs next to your contacts.** It comes only from this repository. `main` accepts changes only through a pull request whose automatic checks pass, and the page tells the browser to run only the app's own code (by exact hash) and to contact no other address.
- **A contacts file.** Text in it is always treated as text, never as code; the browser policy blocks it even if a bug let it through.
- **Backups.** A backup file holds your contacts and history. Keep it private.

## Reporting a problem

If you find a security or privacy problem, please don't post the details publicly. Use **Security → Report a vulnerability** on this repository if it's available, or open an issue that says only "security report, please contact me", and we'll reach you privately.

Please never include real names, phone numbers, contact files or backups in a report.
