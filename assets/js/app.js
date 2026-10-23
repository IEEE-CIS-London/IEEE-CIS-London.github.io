/**
 * IEEE CIS London Section Chapter — site script.
 * All content comes from data/site-data.json; edit that file to update the site.
 */
'use strict';

const TIME_ZONE = 'America/Toronto';

const state = {
  data: { siteMeta: {}, events: [], gallery: [], committee: [] },
  eventView: 'upcoming',
  lightboxIndex: 0,
  admin: false // set by admin.js after a verified GitHub sign-in
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setText('year', new Date().getFullYear());
  setupNav();
  setupDialogs();
  setupEventTabs();
  initHeroCanvas();

  try {
    const res = await fetch('data/site-data.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = { ...state.data, ...(await res.json()) };
  } catch (err) {
    console.error('Could not load data/site-data.json:', err);
  }

  renderAll();
  if (typeof initAdmin === 'function') initAdmin();
}

function renderAll() {
  renderMeta();
  renderStats();
  renderNextEvent();
  renderEvents();
  renderGallery();
  renderCommittee();
}

// ---------- Data helpers ----------

function todayIso() {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

function splitEvents() {
  const today = todayIso();
  const events = (state.data.events || []).filter(e => e && e.date);
  const upcoming = events.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter(e => e.date < today).sort((a, b) => b.date.localeCompare(a.date));
  return { upcoming, past };
}

function findEvent(id) {
  return (state.data.events || []).find(e => e.id === id);
}

// ---------- Renderers ----------

function renderMeta() {
  const meta = state.data.siteMeta || {};

  if (meta.announcement) {
    setText('announcement-text', meta.announcement);
    document.getElementById('announcement').hidden = false;
  }

  const email = meta.contactEmail || '';
  document.querySelectorAll('[data-mailto]').forEach(a => {
    if (email) a.href = `mailto:${email}`;
  });
  document.querySelectorAll('[data-email-text]').forEach(a => {
    a.textContent = email || 'Coming soon';
  });

  const listUrl = safeUrl(meta.mailingListUrl);
  if (listUrl) {
    document.getElementById('mailing-list-link').href = listUrl;
    document.getElementById('mailing-list-row').hidden = false;
  }
}

function renderStats() {
  const stats = (state.data.siteMeta?.stats || []).filter(s => s && String(s.value).trim() && s.label);
  const wrap = document.getElementById('stats');
  // A single number on its own looks unfinished; admins always see the strip so they can edit it
  wrap.hidden = stats.length < 2 && !state.admin;
  document.getElementById('stats-grid').innerHTML = stats.map(s => `
    <li class="stat">
      <span class="stat-value">${escapeHtml(s.value)}</span>
      <span class="stat-label">${escapeHtml(s.label)}</span>
    </li>`).join('');
}

function renderNextEvent() {
  const body = document.getElementById('next-event-body');
  const next = splitEvents().upcoming[0];
  if (!next) {
    body.innerHTML = `
      <p class="next-event-empty">Our next events are being planned.</p>
      <p class="next-event-hint">Check back soon, or <a href="#join">get in touch</a> to suggest a talk.</p>`;
    return;
  }
  body.innerHTML = `
    <p class="next-event-date">${escapeHtml(formatDate(next.date, { weekday: 'long' }))}${next.startTime ? ` · ${escapeHtml(formatTimeRange(next))}` : ''}</p>
    <h2 class="next-event-title">${escapeHtml(next.title)}</h2>
    ${next.location ? `<p class="next-event-meta">${escapeHtml(next.location)}</p>` : ''}
    <div class="next-event-actions">
      <button class="btn btn-accent btn-sm" data-event-detail="${escapeHtml(next.id)}">Details</button>
      ${registerLink(next, 'btn btn-ghost btn-sm')}
    </div>`;
}

function renderEvents() {
  const list = document.getElementById('event-list');
  const { upcoming, past } = splitEvents();
  const events = state.eventView === 'upcoming' ? upcoming : past;

  if (!events.length) {
    list.innerHTML = state.eventView === 'upcoming'
      ? `<div class="empty">
           <p class="empty-title">No upcoming events announced yet</p>
           <p>New events will be posted here and on the
             <a href="https://events.vtools.ieee.org/" target="_blank" rel="noopener">IEEE vTools events calendar</a>.
             Interested in speaking? <a href="#join">Contact us</a>.</p>
         </div>`
      : `<div class="empty"><p class="empty-title">No past events yet</p><p>Past chapter events will be archived here.</p></div>`;
    return;
  }

  list.innerHTML = events.map(evt => {
    const [month, day] = dateParts(evt.date);
    return `
      <article class="event">
        <div class="event-date" aria-hidden="true">
          <span class="event-month">${escapeHtml(month)}</span>
          <span class="event-day">${escapeHtml(day)}</span>
        </div>
        <div class="event-main">
          ${evt.category ? `<p class="event-category">${escapeHtml(evt.category)}</p>` : ''}
          <h3 class="event-title">
            <button class="link-button" data-event-detail="${escapeHtml(evt.id)}">${escapeHtml(evt.title)}</button>
          </h3>
          <p class="event-meta">
            <span>${escapeHtml(formatDate(evt.date, { weekday: 'short' }))}${evt.startTime ? ` · ${escapeHtml(formatTimeRange(evt))}` : ''}</span>
            ${evt.location ? `<span>${escapeHtml(evt.location)}</span>` : ''}
          </p>
          ${evt.speaker ? `<p class="event-speaker">${escapeHtml(evt.speaker)}</p>` : ''}
          ${evt.summary ? `<p class="event-summary">${escapeHtml(evt.summary)}</p>` : ''}
        </div>
        <div class="event-actions">
          ${state.eventView === 'upcoming' ? registerLink(evt, 'btn btn-primary btn-sm') : ''}
          ${state.eventView === 'upcoming' ? `<button class="btn btn-outline btn-sm" data-event-ics="${escapeHtml(evt.id)}">Add to calendar</button>` : ''}
          <button class="btn btn-outline btn-sm" data-event-detail="${escapeHtml(evt.id)}">Details</button>
          ${state.admin ? `<button class="btn btn-outline btn-sm" data-admin="edit-event" data-id="${escapeHtml(evt.id)}">Edit</button>` : ''}
        </div>
      </article>`;
  }).join('');
}

function registerLink(evt, className) {
  const url = safeUrl(evt.registrationUrl);
  return url ? `<a class="${className}" href="${escapeHtml(url)}" target="_blank" rel="noopener">Register &#8599;&#xFE0E;</a>` : '';
}

function openEventDetail(id) {
  const evt = findEvent(id);
  if (!evt) return;
  const isUpcoming = evt.date >= todayIso();
  const image = safeUrl(evt.image);

  setText('event-dialog-title', evt.title);
  document.getElementById('event-dialog-body').innerHTML = `
    ${image ? `<img class="dialog-image" src="${escapeHtml(image)}" alt="" />` : ''}
    <dl class="detail-list">
      <div><dt>Date</dt><dd>${escapeHtml(formatDate(evt.date, { weekday: 'long' }))}</dd></div>
      ${evt.startTime ? `<div><dt>Time</dt><dd>${escapeHtml(formatTimeRange(evt))} (Eastern Time)</dd></div>` : ''}
      ${evt.location ? `<div><dt>Location</dt><dd>${escapeHtml(evt.location)}</dd></div>` : ''}
      ${evt.speaker ? `<div><dt>Speaker</dt><dd>${escapeHtml(evt.speaker)}</dd></div>` : ''}
    </dl>
    <div class="detail-text">${escapeHtml(evt.description || evt.summary || '')}</div>
    <div class="detail-actions">
      ${isUpcoming ? registerLink(evt, 'btn btn-primary') : ''}
      ${isUpcoming ? `<button class="btn btn-outline" data-event-ics="${escapeHtml(evt.id)}">Add to calendar (.ics)</button>` : ''}
    </div>`;
  document.getElementById('event-dialog').showModal();
}

function renderGallery() {
  const photos = (state.data.gallery || []).filter(p => safeUrl(p.url));
  if (!photos.length) return;

  document.getElementById('gallery').hidden = false;
  document.querySelector('[data-section-link="gallery"]').hidden = false;
  document.getElementById('gallery-grid').innerHTML = photos.map((p, i) => `
    <button class="gallery-item" data-photo="${i}">
      <img src="${escapeHtml(safeUrl(p.url))}" alt="${escapeHtml(p.title || '')}" loading="lazy" />
      <span class="gallery-caption">${escapeHtml(p.title || '')}</span>
    </button>`).join('');
}

function openLightbox(index) {
  const photos = (state.data.gallery || []).filter(p => safeUrl(p.url));
  if (!photos.length) return;
  state.lightboxIndex = (index + photos.length) % photos.length;
  const p = photos[state.lightboxIndex];
  setText('lightbox-title', p.title || 'Photo');
  const img = document.getElementById('lightbox-img');
  img.src = safeUrl(p.url);
  img.alt = p.title || '';
  setText('lightbox-caption', [p.caption, p.date && formatDate(p.date)].filter(Boolean).join(' — '));
  const dialog = document.getElementById('lightbox');
  if (!dialog.open) dialog.showModal();
}

function renderCommittee() {
  const grid = document.getElementById('committee-grid');
  grid.innerHTML = (state.data.committee || []).map(m => {
    const vacant = !m.name;
    const profile = safeUrl(m.profileUrl);
    const photo = safeUrl(m.photo);
    const avatar = photo
      ? `<img class="member-avatar" src="${escapeHtml(photo)}" alt="" loading="lazy" />`
      : `<span class="member-avatar" aria-hidden="true">${vacant ? '?' : escapeHtml(initials(m.name))}</span>`;
    return `
      <li class="member${vacant ? ' member-vacant' : ''}">
        ${avatar}
        <p class="member-role">${escapeHtml(m.role || '')}</p>
        <h3 class="member-name">${vacant ? 'To be announced' : escapeHtml(m.name)}</h3>
        ${m.affiliation ? `<p class="member-affil">${escapeHtml(m.affiliation)}</p>` : ''}
        ${(profile || m.email) ? `
          <p class="member-links">
            ${profile ? `<a href="${escapeHtml(profile)}" target="_blank" rel="noopener">Profile &#8599;&#xFE0E;</a>` : ''}
            ${m.email ? `<a href="mailto:${escapeHtml(m.email)}">Email</a>` : ''}
          </p>` : ''}
      </li>`;
  }).join('');
}

// ---------- Interaction setup ----------

function setupNav() {
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('site-nav');
  const setOpen = open => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  nav.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });

  // Highlight the nav link of the section currently in view
  const links = new Map([...nav.querySelectorAll('a[href^="#"]')].map(a => [a.getAttribute('href').slice(1), a]));
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      links.forEach(a => a.removeAttribute('aria-current'));
      links.get(entry.target.id)?.setAttribute('aria-current', 'true');
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => { const s = document.getElementById(id); if (s) observer.observe(s); });
}

function setupEventTabs() {
  document.querySelectorAll('[data-event-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.eventView = btn.dataset.eventView;
      document.querySelectorAll('[data-event-view]').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
      renderEvents();
    });
  });
}

function setupDialogs() {
  document.addEventListener('click', e => {
    const detail = e.target.closest('[data-event-detail]');
    if (detail) return openEventDetail(detail.dataset.eventDetail);

    const ics = e.target.closest('[data-event-ics]');
    if (ics) return downloadIcs(ics.dataset.eventIcs);

    const photo = e.target.closest('[data-photo]');
    if (photo) return openLightbox(Number(photo.dataset.photo));

    const step = e.target.closest('[data-step]');
    if (step) return openLightbox(state.lightboxIndex + Number(step.dataset.step));

    if (e.target.closest('[data-close]')) return e.target.closest('dialog').close();

    // Click on the backdrop closes the dialog (not for forms, to avoid losing edits)
    if (e.target instanceof HTMLDialogElement && !e.target.querySelector('form')) e.target.close();
  });

  const lightbox = document.getElementById('lightbox');
  lightbox.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') openLightbox(state.lightboxIndex - 1);
    if (e.key === 'ArrowRight') openLightbox(state.lightboxIndex + 1);
  });
  let touchX = 0;
  lightbox.addEventListener('touchstart', e => { touchX = e.changedTouches[0].screenX; }, { passive: true });
  lightbox.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].screenX - touchX;
    if (Math.abs(dx) > 45) openLightbox(state.lightboxIndex + (dx < 0 ? 1 : -1));
  }, { passive: true });
}

// ---------- Calendar export (RFC 5545) ----------

function downloadIcs(id) {
  const evt = findEvent(id);
  if (!evt) return;
  const blob = new Blob([buildIcs(evt)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${evt.id}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildIcs(evt) {
  const day = evt.date.replace(/-/g, '');
  const time = t => t.replace(':', '') + '00';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

  let when;
  if (evt.startTime) {
    when = [
      `DTSTART;TZID=${TIME_ZONE}:${day}T${time(evt.startTime)}`,
      `DTEND;TZID=${TIME_ZONE}:${day}T${time(evt.endTime || evt.startTime)}`
    ];
  } else {
    const next = new Date(`${evt.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    when = [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`];
  }

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//IEEE CIS London Section Chapter//Website//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE',
    `TZID:${TIME_ZONE}`,
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'TZNAME:EDT',
    'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'TZNAME:EST',
    'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${evt.id}@ieee-cis-london.github.io`,
    `DTSTAMP:${stamp}`,
    ...when,
    `SUMMARY:${icsText(evt.title)}`,
    `DESCRIPTION:${icsText(evt.summary || '')}`,
    `LOCATION:${icsText(evt.location || 'London, Ontario, Canada')}`,
    ...(safeUrl(evt.registrationUrl) ? [`URL:${evt.registrationUrl}`] : []),
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

function icsText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// ---------- Formatting & safety utilities ----------

function dateFromIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(iso, extra = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '';
  return dateFromIso(iso).toLocaleDateString('en-CA', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric', ...extra });
}

function dateParts(iso) {
  const d = dateFromIso(iso);
  return [d.toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'short' }).replace('.', ''), String(d.getUTCDate())];
}

function formatTimeRange(evt) {
  const fmt = t => {
    const [h, m] = t.split(':').map(Number);
    const suffix = h < 12 ? 'a.m.' : 'p.m.';
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
  };
  return evt.endTime ? `${fmt(evt.startTime)} – ${fmt(evt.endTime)}` : fmt(evt.startTime);
}

function initials(name) {
  return name.replace(/^(prof|dr)\.?\s+/i, '').split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

/** Allow only http(s), mailto and same-site relative URLs. */
function safeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) return '';
  return trimmed;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ---------- Hero background ----------

function initHeroCanvas() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LINK = 140;
  let width = 0, height = 0, nodes = [], running = false, frame = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(48, Math.max(18, width / 28)));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 1
    }));
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < LINK) {
          ctx.strokeStyle = `rgba(120, 214, 240, ${0.28 * (1 - dist / LINK)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(160, 228, 246, 0.85)';
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function tick() {
    if (!running) return;
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > width) n.vx *= -1;
      if (n.y < 0 || n.y > height) n.vy *= -1;
    }
    draw();
    frame = requestAnimationFrame(tick);
  }

  function setRunning(on) {
    if (reduceMotion || on === running) return;
    running = on;
    if (on) frame = requestAnimationFrame(tick);
    else cancelAnimationFrame(frame);
  }

  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); });
  let inView = true;
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    setRunning(inView && !document.hidden);
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => setRunning(inView && !document.hidden));
  resize();
}
