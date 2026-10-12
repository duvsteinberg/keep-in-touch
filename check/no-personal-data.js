// Fails if the repo holds a kind of file that carries personal data: contact exports (.vcf, .csv)
// or app backups (.json). This repo is public, and the app never needs any of them to build.
// Run:  node check/no-personal-data.js
'use strict';
const { execFileSync } = require('child_process');

const BLOCKED = /\.(vcf|vcard|csv|json)$/i;
const files = execFileSync('git', ['ls-files', '-z'], { cwd: __dirname + '/..', encoding: 'utf8' }).split('\0').filter(Boolean);
const found = files.filter((f) => BLOCKED.test(f));

if (found.length) {
  console.error('FAIL personal-data file types are in the repo (contact exports or backups):\n  ' + found.join('\n  '));
  process.exitCode = 1;
} else {
  console.log('PASS no contact exports or backups among ' + files.length + ' files');
}
