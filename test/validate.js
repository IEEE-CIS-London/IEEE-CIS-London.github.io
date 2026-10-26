/**
 * Validates data/site-data.json and basic site integrity.
 *
 * Usage: node test/validate.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkUrl(where, url) {
  if (!url) return;
  if (/^(https?:|mailto:)/i.test(url)) return;
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(url)) return errors.push(`${where}: unsupported URL "${url}"`);
  // Images uploaded through the admin page exist in the repo once published
  if (!fs.existsSync(path.join(ROOT, url.split(/[?#]/)[0]))) warnings.push(`${where}: local file not found "${url}"`);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site-data.json'), 'utf8'));
} catch (err) {
  console.error(`✗ data/site-data.json is not valid JSON: ${err.message}`);
  process.exit(1);
}

for (const key of ['siteMeta', 'events', 'gallery', 'committee']) {
  if (!(key in data)) errors.push(`missing top-level key "${key}"`);
}

const meta = data.siteMeta || {};
if (meta.contactEmail && !EMAIL.test(meta.contactEmail)) errors.push(`siteMeta.contactEmail is not an email: "${meta.contactEmail}"`);
checkUrl('siteMeta.mailingListUrl', meta.mailingListUrl);
(meta.stats || []).forEach((s, i) => {
  if (!s.label) errors.push(`siteMeta.stats[${i}]: missing "label"`);
});

const ids = new Set();
(data.events || []).forEach((e, i) => {
  const where = `events[${i}]${e.id ? ` (${e.id})` : ''}`;
  for (const f of ['id', 'title', 'date']) if (!e[f]) errors.push(`${where}: missing "${f}"`);
  if (e.id && ids.has(e.id)) errors.push(`${where}: duplicate id`);
  ids.add(e.id);
  if (e.id && !/^[a-z0-9-]+$/.test(e.id)) errors.push(`${where}: id must be lowercase letters, digits and dashes`);
  if (e.date && !DATE.test(e.date)) errors.push(`${where}: date must be YYYY-MM-DD`);
  if (e.startTime && !TIME.test(e.startTime)) errors.push(`${where}: startTime must be HH:MM (24h)`);
  if (e.endTime && !TIME.test(e.endTime)) errors.push(`${where}: endTime must be HH:MM (24h)`);
  if (e.endTime && !e.startTime) errors.push(`${where}: endTime given without startTime`);
  if (e.startTime && e.endTime && e.endTime <= e.startTime) errors.push(`${where}: endTime must be after startTime`);
  if (!e.location) warnings.push(`${where}: no location`);
  checkUrl(`${where}.registrationUrl`, e.registrationUrl);
  checkUrl(`${where}.image`, e.image);
});

(data.gallery || []).forEach((p, i) => {
  const where = `gallery[${i}]`;
  if (!p.url) errors.push(`${where}: missing "url"`);
  if (!p.title) warnings.push(`${where}: no title (used as alt text)`);
  if (p.date && !DATE.test(p.date)) errors.push(`${where}: date must be YYYY-MM-DD`);
  checkUrl(`${where}.url`, p.url);
});

(data.committee || []).forEach((m, i) => {
  const where = `committee[${i}]${m.name ? ` (${m.name})` : ''}`;
  if (!m.role) errors.push(`${where}: missing "role"`);
  if (m.email && !EMAIL.test(m.email)) errors.push(`${where}: invalid email "${m.email}"`);
  checkUrl(`${where}.profileUrl`, m.profileUrl);
  checkUrl(`${where}.photo`, m.photo);
});

// No secrets, hard-coded passwords or leftover UK template content
const files = ['index.html', 'event.html', 'assets/js/app.js', 'assets/js/admin.js', 'assets/css/style.css', 'data/site-data.json', 'README.md'];
for (const file of files) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/.test(text)) errors.push(`${file}: contains what looks like a GitHub token`);
  if (/cis-london-2026|admin123/.test(text)) errors.push(`${file}: contains a hard-coded password`);
  if (/ieee-ukandireland|Region 8|Imperial College/i.test(text)) errors.push(`${file}: contains leftover UK template content`);
}

// Every in-page link must point to an existing element
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const [, id] of html.matchAll(/href="#([\w-]+)"/g)) {
  if (!html.includes(`id="${id}"`)) errors.push(`index.html: link to missing anchor #${id}`);
}

warnings.forEach(w => console.warn(`⚠ ${w}`));
if (errors.length) {
  errors.forEach(e => console.error(`✗ ${e}`));
  console.error(`\n${errors.length} error(s).`);
  process.exit(1);
}
console.log(`✓ site data valid — ${data.events.length} events, ${data.gallery.length} photos, ${data.committee.length} committee members`);
