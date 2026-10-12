// Writes a small Google-style contacts export with an Android quoted-printable card (accented name), duplicates and businesses.
const fs = require('fs');
const qp = (t) => Buffer.from(t, 'utf8').toString('hex').toUpperCase().replace(/(..)/g, '=$1');
const cards = [
  ['VERSION:3.0', 'FN:Rachel Stone', 'N:Stone;Rachel;;;', 'TEL;TYPE=CELL:+972 50-111-2233', 'BDAY:1992-03-04', 'CATEGORIES:myContacts,starred'],
  ['VERSION:3.0', 'FN:Rachel', 'N:;Rachel;;;', 'TEL;TYPE=CELL:0501112233', 'CATEGORIES:myContacts'],
  ['VERSION:3.0', 'FN:Josh Carter', 'N:Carter;Josh;;;', 'TEL;TYPE=CELL:052-444-5566', 'CATEGORIES:myContacts'],
  ['VERSION:3.0', 'FN:Mom', 'N:;Mom;;;', 'TEL;TYPE=CELL:+972 54-777-8899', 'CATEGORIES:myContacts,starred'],
  ['VERSION:2.1', 'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:' + qp('Müller') + ';' + qp('José') + ';;;', 'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:' + qp('José Müller'), 'TEL;CELL:053-222-3344'],
  ['VERSION:3.0', 'FN:Dana Lee', 'N:Lee;Dana;;;', 'ORG:Acme Ltd', 'TEL;TYPE=WORK:03-555-1212', 'CATEGORIES:myContacts'],
  ['VERSION:3.0', 'FN:Pizza Hut', 'N:;;;;', 'ORG:Pizza Hut', 'TEL;TYPE=WORK:03-555-9090', 'CATEGORIES:myContacts'],
  ['VERSION:3.0', 'FN:Steve Plumber', 'N:Plumber;Steve;;;', 'TEL;TYPE=CELL:058-999-0011', 'CATEGORIES:myContacts'],
  ['VERSION:3.0', 'FN:Leah Grant', 'N:Grant;Leah;;;', 'EMAIL:leah@example.com', 'CATEGORIES:myContacts'],
  ['VERSION:3.0', 'FN:Pizza Line', 'TEL:*3030', 'CATEGORIES:myContacts'],
  ['VERSION:3.0', 'FN:Sarah Klein', 'N:Klein;Sarah;;;', 'TEL;TYPE=CELL:055-123-4567', 'CATEGORIES:myContacts,Friends'],
  ['VERSION:3.0', 'FN:David Freeman', 'N:Freeman;David;;;', 'TEL;TYPE=CELL:+972-52-765-4321', 'CATEGORIES:myContacts', 'BDAY:--05-12'],
];
const text = cards.map((c) => ['BEGIN:VCARD', ...c, 'END:VCARD'].join('\r\n')).join('\r\n') + '\r\n';
fs.writeFileSync(__dirname + '/contacts.vcf', text);
console.log('wrote contacts.vcf with', cards.length, 'cards');
