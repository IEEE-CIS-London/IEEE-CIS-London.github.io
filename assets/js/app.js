/**
 * IEEE CIS London Section Chapter — site script.
 * All content comes from data/site-data.json; edit that file to update the site.
 */
'use strict';

const TIME_ZONE = 'America/Toronto';

const state = {
  data: { siteMeta: {}, events: [], gallery: [], committee: [] },
  eventView: 'all',
  galleryFilter: 'all',
  lightboxIndex: 0,
  draftPreviews: {},
  admin: false // set by admin.js after a verified GitHub sign-in
};

document.addEventListener('DOMContentLoaded', init);

const IS_EVENT_PAGE = document.body?.dataset.page === 'event';

async function init() {
  setText('year', new Date().getFullYear());
  setupNav();
  setupDialogs();
  if (!IS_EVENT_PAGE) {
    setupEventTabs();
    initHeroCanvas();
  }

  try {
    const res = await fetch('data/site-data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = { ...state.data, ...(await res.json()) };
  } catch (err) {
    console.error('Could not load data/site-data.json:', err);
  }

  // If an admin has unsaved/recently edited session data in this tab, use it so standalone event.html reflects edits immediately
  try {
    const draft = JSON.parse(sessionStorage.getItem('ieee_cis_london_draft_data') || 'null');
    if (draft && Array.isArray(draft.events)) {
      state.data = { ...state.data, ...draft };
    }
    const previews = JSON.parse(sessionStorage.getItem('ieee_cis_london_draft_previews') || 'null');
    if (previews && typeof previews === 'object') {
      state.draftPreviews = previews;
    }
  } catch { /* storage unavailable */ }

  if (IS_EVENT_PAGE) return renderEventPage();
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

function isPastEvent(evt) {
  if (evt.status === 'past') return true;
  if (evt.status === 'upcoming') return false;
  return evt.date < todayIso();
}

function splitEvents() {
  const events = (state.data.events || []).filter(e => e && e.date);
  const upcoming = events.filter(e => !isPastEvent(e)).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter(e => isPastEvent(e)).sort((a, b) => b.date.localeCompare(a.date));
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
    <a class="next-event-cover" href="${eventUrl(next)}" data-event-detail="${escapeHtml(next.id)}" aria-label="Details: ${escapeHtml(next.title)}">
      <img src="${escapeHtml(coverFor(next))}" alt="" />
      ${next.category ? `<span class="badge badge-category">${escapeHtml(next.category)}</span>` : ''}
    </a>
    <p class="next-event-date">${escapeHtml(formatDate(next.date, { weekday: 'long' }))}${next.startTime ? ` · ${escapeHtml(formatTimeRange(next))}` : ''}</p>
    <h2 class="next-event-title">${escapeHtml(next.title)}</h2>
    ${next.location ? `<p class="next-event-meta">📍 ${escapeHtml(next.location)}</p>` : ''}
    ${next.speaker ? `<p class="next-event-meta">🎙️ ${escapeHtml(next.speaker)}</p>` : ''}
    ${next.summary ? `<p class="next-event-summary">${escapeHtml(next.summary)}</p>` : ''}
    <div class="next-event-actions">
      <a class="btn btn-accent btn-sm" href="${eventUrl(next)}" data-event-detail="${escapeHtml(next.id)}">Details</a>
      ${registerLink(next, 'btn btn-ghost btn-sm')}
    </div>`;
}

// Decorative covers for events without their own image
const DEFAULT_COVERS = [
  'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1000&q=80',
  'https://images.unsplash.com/photo-1591115765373-5207764f72e7?auto=format&fit=crop&w=1000&q=80',
  'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1000&q=80'
];

// Shown in the events grid until real events are announced
const PLACEHOLDER_EVENTS = [
  { category: 'Distinguished Lecture', title: 'IEEE CIS Distinguished Lecture', summary: 'A talk by an IEEE CIS Distinguished Lecturer on recent advances in computational intelligence.' },
  { category: 'Technical Seminar', title: 'Chapter Technical Seminar Series', summary: 'Regular seminars by local researchers on neural networks, fuzzy systems and evolutionary computation.' },
  { category: 'Workshop', title: 'Hands-on Workshop & Student Meetup', summary: 'Tutorials, poster sessions and networking for students and young professionals.' }
];

function eventPhotos(evt) {
  if (!evt) return [];
  const raw = Array.isArray(evt.images) && evt.images.length
    ? evt.images
    : (evt.image ? [evt.image] : []);
  return [...new Set(raw.filter(Boolean))];
}

function coverFor(evt, i = 0) {
  const first = eventPhotos(evt)[0];
  return mediaUrl(first) || DEFAULT_COVERS[i % DEFAULT_COVERS.length];
}

function renderEvents() {
  const list = document.getElementById('event-list');
  const { upcoming, past } = splitEvents();
  const query = (document.getElementById('event-search')?.value || '').trim().toLowerCase();
  const pool = state.eventView === 'upcoming' ? upcoming : state.eventView === 'past' ? past : [...upcoming, ...past];
  const events = pool.filter(evt => !query ||
    [evt.title, evt.summary, evt.location, evt.speaker, evt.category].join(' ').toLowerCase().includes(query));

  if (!events.length) {
    if (query) {
      list.innerHTML = `<div class="empty"><p class="empty-title">No events match “${escapeHtml(query)}”</p></div>`;
    } else if (state.eventView === 'past') {
      list.innerHTML = `<div class="empty"><p class="empty-title">No past events yet</p><p>Past chapter events will be archived here.</p></div>`;
    } else {
      const adminNote = state.admin
        ? `<p class="admin-note">These “Coming soon” cards are examples shown while there are no upcoming events.
             Use <strong>+ New event</strong> to add a real one — the examples disappear automatically.</p>`
        : '';
      list.innerHTML = adminNote + PLACEHOLDER_EVENTS.map((evt, i) => `
        <article class="event-card event-card-placeholder">
          <div class="event-image-wrap">
            <img src="${DEFAULT_COVERS[i]}" alt="" loading="lazy" />
            <div class="event-badges">
              <span class="badge badge-soon">Coming soon</span>
              <span class="badge badge-category">${escapeHtml(evt.category)}</span>
            </div>
          </div>
          <div class="event-body">
            <div class="event-meta">
              <span>📅 Date to be announced</span>
              <span>📍 London, Ontario</span>
            </div>
            <h3 class="event-title">${escapeHtml(evt.title)}</h3>
            <p class="event-summary">${escapeHtml(evt.summary)}</p>
            <div class="event-footer">
              <a class="btn btn-outline btn-sm" href="#join">Suggest a speaker</a>
              <a class="btn btn-primary btn-sm" href="mailto:${escapeHtml(state.data.siteMeta?.contactEmail || '')}">Get notified</a>
            </div>
          </div>
        </article>`).join('');
    }
    return;
  }

  list.innerHTML = events.map((evt, i) => {
    const isUpcoming = !isPastEvent(evt);
    return `
      <article class="event-card">
        <a class="event-image-wrap" href="${eventUrl(evt)}" data-event-detail="${escapeHtml(evt.id)}" tabindex="-1" aria-hidden="true">
          <img src="${escapeHtml(coverFor(evt, i))}" alt="" loading="lazy" />
          <div class="event-badges">
            <span class="badge ${isUpcoming ? 'badge-upcoming' : 'badge-past'}">${isUpcoming ? '● Upcoming' : 'Past event'}</span>
            ${evt.category ? `<span class="badge badge-category">${escapeHtml(evt.category)}</span>` : ''}
          </div>
        </a>
        <div class="event-body">
          <div class="event-meta">
            <span>📅 <strong>${escapeHtml(formatDate(evt.date, { weekday: 'short' }))}</strong>${evt.startTime ? ` · ${escapeHtml(formatTimeRange(evt))}` : ''}</span>
            ${evt.location ? `<span>📍 ${escapeHtml(evt.location)}</span>` : ''}
            ${evt.speaker ? `<span>🎙️ ${escapeHtml(evt.speaker)}</span>` : ''}
          </div>
          <h3 class="event-title">
            <a class="link-button" href="${eventUrl(evt)}" data-event-detail="${escapeHtml(evt.id)}">${escapeHtml(evt.title)}</a>
          </h3>
          <p class="event-summary">${escapeHtml(evt.summary || '')}</p>
          <div class="event-footer">
            <div class="event-footer-group">
              <a class="btn btn-outline btn-sm" href="${eventUrl(evt)}" data-event-detail="${escapeHtml(evt.id)}">Details</a>
              ${isUpcoming ? `<button class="btn btn-outline btn-sm" data-event-ics="${escapeHtml(evt.id)}" title="Add to calendar (.ics)">📆 .ics</button>` : ''}
            </div>
            <div class="event-footer-group">
              ${isUpcoming ? registerLink(evt, 'btn btn-primary btn-sm') : ''}
              ${state.admin ? `<button class="btn btn-outline btn-sm" data-admin="edit-event" data-id="${escapeHtml(evt.id)}">Edit</button>` : ''}
            </div>
          </div>
        </div>
      </article>`;
  }).join('');
}

function registerLink(evt, className) {
  const url = safeUrl(evt.registrationUrl);
  return url ? `<a class="${className}" href="${escapeHtml(url)}" target="_blank" rel="noopener">Register &#8599;&#xFE0E;</a>` : '';
}

function eventUrl(evt) {
  return `event.html?id=${encodeURIComponent(evt.id)}`;
}

function eventFactsHtml(evt) {
  return `
    <dl class="detail-list">
      <div><dt>Date</dt><dd>${escapeHtml(formatDate(evt.date, { weekday: 'long' }))}</dd></div>
      ${evt.startTime ? `<div><dt>Time</dt><dd>${escapeHtml(formatTimeRange(evt))} (Eastern Time)</dd></div>` : ''}
      ${evt.location ? `<div><dt>Location</dt><dd>${escapeHtml(evt.location)}</dd></div>` : ''}
      ${evt.speaker ? `<div><dt>Speaker</dt><dd>${escapeHtml(evt.speaker)}</dd></div>` : ''}
    </dl>`;
}

function eventActionsHtml(evt) {
  if (isPastEvent(evt)) return '';
  return `
    <div class="detail-actions">
      ${registerLink(evt, 'btn btn-primary')}
      <button class="btn btn-outline" data-event-ics="${escapeHtml(evt.id)}">Add to calendar (.ics)</button>
    </div>`;
}

/** Admins with unpublished edits preview events in a dialog: the event page only shows published data. */
function openEventPreview(id) {
  const evt = findEvent(id);
  if (!evt) return;
  const image = mediaUrl(evt.image);
  setText('event-dialog-title', evt.title);
  document.getElementById('event-dialog-body').innerHTML =
    (image ? `<img class="dialog-image" src="${escapeHtml(image)}" alt="" />` : '') + eventFactsHtml(evt) +
    `<div class="detail-text">${escapeHtml(evt.description || evt.summary || '')}</div>` + eventActionsHtml(evt);
  document.getElementById('event-dialog').showModal();
}

// ---------- Event page (event.html?id=…) ----------

function renderEventPage() {
  const root = document.getElementById('event-page');
  const id = new URLSearchParams(location.search).get('id') || '';
  const evt = findEvent(id);

  if (!evt) {
    document.title = 'Event not found | IEEE CIS London Section Chapter';
    root.innerHTML = `
      <div class="container event-page-missing">
        <h1>Event not found</h1>
        <p>This event may have been moved or removed.</p>
        <a class="btn btn-primary" href="index.html#events">See all events</a>
      </div>`;
    return;
  }

  const isUpcoming = !isPastEvent(evt);
  document.title = `${evt.title} | IEEE CIS London Section Chapter`;
  const description = document.querySelector('meta[name="description"]');
  if (description && evt.summary) description.content = evt.summary;

  const { upcoming, past } = splitEvents();
  const others = [...upcoming, ...past].filter(e => e.id !== evt.id).slice(0, 3);
  const photos = eventPhotos(evt).map(url => mediaUrl(url)).filter(Boolean);
  const speakerLink = safeUrl(evt.speakerUrl);
  const hasSpeakerCard = Boolean(evt.speaker || evt.speakerBio || speakerLink);

  root.innerHTML = `
    <section class="event-hero">
      <img class="event-hero-image" src="${escapeHtml(coverFor(evt))}" alt="" />
      <div class="container event-hero-inner">
        <a class="event-back" href="index.html#events">&larr; All events</a>
        <div class="event-badges">
          <span class="badge ${isUpcoming ? 'badge-upcoming' : 'badge-past'}">${isUpcoming ? '● Upcoming' : 'Past event'}</span>
          ${evt.category ? `<span class="badge badge-category">${escapeHtml(evt.category)}</span>` : ''}
        </div>
        <h1>${escapeHtml(evt.title)}</h1>
        <p class="event-hero-date">${escapeHtml(formatDate(evt.date, { weekday: 'long' }))}${evt.startTime ? ` · ${escapeHtml(formatTimeRange(evt))}` : ''}</p>
      </div>
    </section>
    <section class="section event-page-body">
      <div class="container event-page-grid">
        <article class="event-page-main">
          ${evt.summary && evt.description ? `<p class="event-page-lead">${escapeHtml(evt.summary)}</p>` : ''}
          <div class="detail-text">${escapeHtml(evt.description || evt.summary || 'More details will be announced soon.')}</div>
          ${hasSpeakerCard ? `
          <section class="event-speaker-card" aria-labelledby="event-speaker-heading">
            <p class="eyebrow" id="event-speaker-heading">Speaker Introduction</p>
            <div class="event-speaker-header">
              <span class="event-speaker-avatar" aria-hidden="true">${escapeHtml(initials(evt.speaker || 'Speaker'))}</span>
              <div class="event-speaker-title-group">
                <h2 class="event-speaker-name">${escapeHtml(evt.speaker || 'Featured Speaker')}</h2>
                ${speakerLink ? `<a class="event-speaker-link" href="${escapeHtml(speakerLink)}" target="_blank" rel="noopener">Speaker Homepage / CV &#8599;&#xFE0E;</a>` : ''}
              </div>
            </div>
            ${evt.speakerBio
              ? `<div class="detail-text event-speaker-bio">${escapeHtml(evt.speakerBio)}</div>`
              : `<p class="event-speaker-bio event-speaker-bio-empty">Speaker biography will be updated soon.</p>`}
          </section>` : ''}
          ${photos.length ? `
          <section class="event-photos-section" aria-labelledby="event-photos-heading">
            <h2 class="event-sub-title" id="event-photos-heading">Event Photos (${photos.length})</h2>
            <div class="event-photos-grid">
              ${photos.map((src, i) => `
                <button type="button" class="event-photo-thumb" data-photo="${i}" aria-label="View event photo ${i + 1} of ${photos.length}">
                  <img src="${escapeHtml(src)}" alt="${escapeHtml(evt.title)} — photo ${i + 1}" loading="lazy" />
                </button>`).join('')}
            </div>
          </section>` : ''}
        </article>
        <aside class="event-page-side">
          ${eventFactsHtml(evt)}
          ${eventActionsHtml(evt)}
          <button class="btn btn-outline btn-block" data-copy-link>Copy link</button>
        </aside>
      </div>
    </section>
    ${others.length ? `
    <section class="section section-alt">
      <div class="container">
        <h2 class="section-title">More events</h2>
        <ul class="more-events">
          ${others.map(e => `
            <li><a href="${eventUrl(e)}">
              <span class="more-events-date">${escapeHtml(formatDate(e.date))}</span>
              <span class="more-events-title">${escapeHtml(e.title)}</span>
            </a></li>`).join('')}
        </ul>
      </div>
    </section>` : ''}`;
}

function galleryPhotos() {
  if (IS_EVENT_PAGE) {
    const id = new URLSearchParams(location.search).get('id') || '';
    const evt = findEvent(id);
    if (!evt) return [];
    return eventPhotos(evt).map((url, index) => ({
      index,
      photo: { url, title: evt.title, date: evt.date, caption: evt.speaker ? `Speaker: ${evt.speaker}` : '' }
    }));
  }
  return (state.data.gallery || [])
    .map((photo, index) => ({ photo, index }))
    .filter(({ photo }) => mediaUrl(photo.url))
    .filter(({ photo }) => state.galleryFilter === 'all' || photo.eventTag === state.galleryFilter);
}

function renderGallery() {
  const all = (state.data.gallery || []).filter(p => mediaUrl(p.url));
  const tags = [...new Set(all.map(p => p.eventTag).filter(Boolean))];
  if (state.galleryFilter !== 'all' && !tags.includes(state.galleryFilter)) state.galleryFilter = 'all';

  document.getElementById('gallery-filters').innerHTML = tags.length
    ? ['all', ...tags].map(tag => `
        <button class="chip" aria-pressed="${state.galleryFilter === tag}" data-gallery-filter="${escapeHtml(tag)}">
          ${tag === 'all' ? 'All photos' : escapeHtml(tag)}
        </button>`).join('')
    : '';

  const grid = document.getElementById('gallery-grid');
  if (!all.length) {
    grid.innerHTML = [
      ['Talks & lectures', 'Photos from our seminars and Distinguished Lectures will appear here.'],
      ['Workshops', 'Hands-on sessions and tutorials.'],
      ['Community', 'Student meetups, networking and chapter gatherings.']
    ].map(([title, text]) => `
      <div class="gallery-card gallery-card-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3.5" /><path d="M8 5l1.5-2h5L16 5" /></svg>
        <span class="gallery-tag">Coming soon</span>
        <h3 class="gallery-title">${title}</h3>
        <p class="gallery-caption">${text}</p>
      </div>`).join('');
    return;
  }

  grid.innerHTML = galleryPhotos().map(({ photo, index }, i) => `
    <div class="gallery-card">
      <button class="gallery-open" data-photo="${i}" aria-label="Open photo: ${escapeHtml(photo.title || '')}">
        <img src="${escapeHtml(mediaUrl(photo.url))}" alt="${escapeHtml(photo.title || '')}" loading="lazy" />
        <span class="gallery-overlay">
          ${photo.eventTag ? `<span class="gallery-tag">${escapeHtml(photo.eventTag)}</span>` : ''}
          <span class="gallery-title">${escapeHtml(photo.title || '')}</span>
          ${photo.caption ? `<span class="gallery-caption">${escapeHtml(photo.caption)}</span>` : ''}
        </span>
      </button>
      ${state.admin ? `<button class="btn btn-danger btn-sm gallery-delete" data-admin="delete-photo" data-index="${index}">Delete</button>` : ''}
    </div>`).join('');
}

function openLightbox(index) {
  const photos = galleryPhotos();
  if (!photos.length) return;
  state.lightboxIndex = (index + photos.length) % photos.length;
  const { photo: p } = photos[state.lightboxIndex];
  setText('lightbox-title', p.title || 'Photo');
  const img = document.getElementById('lightbox-img');
  img.src = mediaUrl(p.url);
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
  document.getElementById('event-search').addEventListener('input', renderEvents);
}

function setupDialogs() {
  document.addEventListener('click', e => {
    if (e.target.closest('[data-copy-link]')) {
      navigator.clipboard?.writeText(location.href).then(() => {
        e.target.closest('[data-copy-link]').textContent = 'Link copied ✓';
      });
      return;
    }

    const ics = e.target.closest('[data-event-ics]');
    if (ics) return downloadIcs(ics.dataset.eventIcs);

    const filter = e.target.closest('[data-gallery-filter]');
    if (filter) {
      state.galleryFilter = filter.dataset.galleryFilter;
      return renderGallery();
    }

    const photo = e.target.closest('[data-photo]');
    if (photo) return openLightbox(Number(photo.dataset.photo));

    const step = e.target.closest('[data-step]');
    if (step) return openLightbox(state.lightboxIndex + Number(step.dataset.step));

    if (e.target.closest('[data-close]')) return e.target.closest('dialog').close();

    // Click on the backdrop closes the dialog (not for forms, to avoid losing edits)
    if (e.target instanceof HTMLDialogElement && !e.target.querySelector('form')) e.target.close();
  });

  const lightbox = document.getElementById('lightbox');
  if (!lightbox) return;
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

/** Image URL to display: a local preview for images uploaded by an admin but not yet published. */
function mediaUrl(url) {
  return (typeof admin !== 'undefined' && admin.previews.get(url)) || state.draftPreviews?.[url] || safeUrl(url);
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
