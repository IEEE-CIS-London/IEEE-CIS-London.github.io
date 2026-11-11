/**
 * Writes content from data/site-data.json into the static HTML, so search engines and
 * link previews see member names without running JavaScript, and regenerates sitemap.xml.
 * The member markup comes from the same renderMemberListHtml() the browser uses.
 *
 * Usage: node tools/prerender.js          # update files
 *        node tools/prerender.js --check  # exit 1 if any file is out of date
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://ieee-cis-london.github.io/';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Load app.js with just enough of a DOM for its top-level code; we only call its pure helpers.
const sandbox = { document: { body: { dataset: {} }, addEventListener() {} }, window: {}, console };
vm.createContext(sandbox);
vm.runInContext(read('assets/js/app.js'), sandbox);
const renderMembers = members => vm.runInContext('renderMemberListHtml', sandbox)(members);

const data = JSON.parse(read('data/site-data.json'));
const founding = data.foundingMembers?.length ? data.foundingMembers : data.committee;

/** Replace the contents of the <ul> with the given id. */
function fillList(html, id, inner) {
  const re = new RegExp(`(<ul\\b[^>]*\\bid="${id}"[^>]*>)[\\s\\S]*?(</ul>)`);
  if (!re.test(html)) throw new Error(`#${id} not found`);
  return html.replace(re, (_, open, close) => `${open}${inner}\n        ${close}`);
}

function sitemap() {
  const urls = [
    SITE,
    `${SITE}members.html`,
    ...(data.events || []).filter(e => e.id).map(e => `${SITE}event.html?id=${encodeURIComponent(e.id)}`)
  ];
  const esc = s => s.replace(/&/g, '&amp;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}
</urlset>
`;
}

const outputs = {
  'index.html': fillList(read('index.html'), 'committee-grid', renderMembers(data.committee)),
  'members.html': fillList(read('members.html'), 'founding-grid', renderMembers(founding)),
  'sitemap.xml': sitemap()
};

const check = process.argv.includes('--check');
const stale = [];
for (const [file, content] of Object.entries(outputs)) {
  const target = path.join(ROOT, file);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current === content) continue;
  stale.push(file);
  if (!check) fs.writeFileSync(target, content);
}

if (check && stale.length) {
  console.error(`✗ out of date: ${stale.join(', ')} — run: node tools/prerender.js`);
  process.exit(1);
}
console.log(stale.length ? `updated ${stale.join(', ')}` : 'prerendered files are up to date');
