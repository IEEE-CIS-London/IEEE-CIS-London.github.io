/**
 * IEEE CIS London Section — Official Portal & Serverless CMS Application
 */

const STORAGE_KEY_DATA = 'ieee_cis_london_site_data_v1';
const STORAGE_KEY_AUTH = 'ieee_cis_london_admin_auth_v1';
const STORAGE_KEY_GH_TOKEN = 'ieee_cis_london_gh_token_v1';

// Default Admin Credentials
const ADMIN_CREDENTIALS = {
  username: 'admin',
  passwords: ['cis-london-2026', 'ieee2026', 'admin123']
};

let siteData = null;
let currentEventFilter = 'all';
let currentTopicFilter = 'all';
let currentGalleryFilter = 'all';
let currentLightboxIndex = 0;
let filteredGalleryList = [];
let isAdminLoggedIn = false;

// ==========================================
// 1. INITIALIZATION & DATA LOADING
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  initNeuralCanvas();
  checkAdminSession();
  await loadSiteData();
  setupDragAndDrop();
  setupKeyboardShortcuts();
});

async function loadSiteData() {
  try {
    const response = await fetch(`data/site-data.json?t=${Date.now()}`);
    if (!response.ok) throw new Error('Failed to load site-data.json');
    const remoteData = await response.json();

    const localOverride = localStorage.getItem(STORAGE_KEY_DATA);
    if (localOverride) {
      try {
        siteData = JSON.parse(localOverride);
      } catch {
        siteData = remoteData;
      }
    } else {
      siteData = remoteData;
    }
  } catch (err) {
    console.warn('Using fallback or cached data:', err);
    const localOverride = localStorage.getItem(STORAGE_KEY_DATA);
    if (localOverride) {
      siteData = JSON.parse(localOverride);
    }
  }

  if (siteData) {
    renderAll();
  }
}

function saveDataLocally() {
  localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(siteData));
  renderAll();
}

function renderAll() {
  renderSiteMeta();
  renderStats();
  renderEvents();
  renderTopics();
  renderGalleryFilters();
  renderGallery();
  renderCommittee();
  if (isAdminLoggedIn) {
    renderAdminLists();
  }
}

// ==========================================
// 2. PUBLIC WEBSITE RENDERERS
// ==========================================
function renderSiteMeta() {
  const meta = siteData.siteMeta || {};
  setText('hero-announcement', meta.announcement || '');
  setText('hero-badge-text', meta.heroBadge || 'IEEE Computational Intelligence Society • London Chapter');
  setText('hero-title', meta.heroTitle || '');
  setText('hero-description', meta.heroDescription || '');
  setText('contact-location', meta.location || 'London, United Kingdom');
  setText('contact-email-display', meta.contactEmail || 'london-cis@ieee-ukandireland.org');

  const emailBtn = document.getElementById('contact-email-btn');
  if (emailBtn && meta.contactEmail) {
    emailBtn.href = `mailto:${meta.contactEmail}`;
  }
}

function renderStats() {
  const container = document.getElementById('stats-grid');
  if (!container || !siteData.siteMeta?.stats) return;
  container.innerHTML = siteData.siteMeta.stats.map(s => `
    <div class="stat-card">
      <div class="stat-value">${escapeHtml(s.value)}</div>
      <div class="stat-label">${escapeHtml(s.label)}</div>
    </div>
  `).join('');
}

function renderEvents() {
  const container = document.getElementById('events-grid');
  if (!container) return;

  const events = (siteData.events || []).filter(evt => {
    if (currentEventFilter === 'all') return true;
    return evt.status === currentEventFilter;
  });

  if (events.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding: 48px; background:#fff; border-radius:12px; border:1px solid var(--border-color);">
        <p style="color:var(--text-secondary); font-size:1rem;">No events match the selected filter.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = events.map(evt => {
    const isUpcoming = evt.status === 'upcoming';
    return `
      <article class="event-card">
        <div class="event-image-wrap">
          <img src="${escapeHtml(evt.image || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1000&q=80')}" alt="${escapeHtml(evt.title)}" loading="lazy" />
          <div class="event-badges">
            <span class="badge ${isUpcoming ? 'badge-upcoming' : 'badge-past'}">
              ${isUpcoming ? '● Upcoming' : 'Past Event'}
            </span>
            <span class="badge badge-category">${escapeHtml(evt.category || 'Event')}</span>
          </div>
        </div>
        <div class="event-body">
          <div class="event-meta">
            <div class="event-meta-row">
              <span>📅 <strong>${formatDate(evt.date)}</strong> • ${escapeHtml(evt.time || '')}</span>
            </div>
            <div class="event-meta-row">
              <span>📍 ${escapeHtml(evt.location || 'London, UK')}</span>
            </div>
            ${evt.speaker ? `<div class="event-meta-row"><span>🎙️ ${escapeHtml(evt.speaker)}</span></div>` : ''}
          </div>
          <h3 class="event-title">${escapeHtml(evt.title)}</h3>
          <p class="event-summary">${escapeHtml(evt.summary)}</p>
          <div class="event-footer">
            <button class="btn btn-outline btn-sm" onclick="openEventDetail('${escapeHtml(evt.id)}')">
              Read Full Details
            </button>
            <div style="display:flex; gap:6px;">
              ${isUpcoming && evt.registrationUrl ? `
                <a href="${escapeHtml(evt.registrationUrl)}" class="btn btn-primary btn-sm">Register</a>
              ` : ''}
              ${isAdminLoggedIn ? `
                <button class="btn btn-outline btn-sm" onclick="editEventById('${escapeHtml(evt.id)}')" title="Edit Event">✏️</button>
              ` : ''}
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function filterEvents(status, btn) {
  currentEventFilter = status;
  document.querySelectorAll('#event-filters .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderEvents();
}

function openEventDetail(eventId) {
  const evt = (siteData.events || []).find(e => e.id === eventId);
  if (!evt) return;

  document.getElementById('detail-modal-title').textContent = evt.category + ' — Event Details';
  const body = document.getElementById('detail-modal-body');
  body.innerHTML = `
    <img src="${escapeHtml(evt.image)}" alt="${escapeHtml(evt.title)}" style="width:100%; max-height:320px; object-fit:cover; border-radius:12px; margin-bottom:20px;" />
    <span class="badge ${evt.status === 'upcoming' ? 'badge-upcoming' : 'badge-past'}" style="display:inline-block; margin-bottom:10px;">
      ${evt.status === 'upcoming' ? 'Upcoming Event' : 'Past Event Archive'}
    </span>
    <h2 style="font-size:1.5rem; font-weight:800; color:var(--ieee-navy); margin-bottom:14px;">${escapeHtml(evt.title)}</h2>
    <div style="background:#F8FAFC; padding:16px; border-radius:10px; border:1px solid var(--border-color); margin-bottom:20px; font-size:0.9rem;">
      <p style="margin-bottom:6px;"><strong>📅 Date &amp; Time:</strong> ${formatDate(evt.date)} (${escapeHtml(evt.time)})</p>
      <p style="margin-bottom:6px;"><strong>📍 Venue:</strong> ${escapeHtml(evt.location)}</p>
      ${evt.speaker ? `<p><strong>🎙️ Featured Speaker(s):</strong> ${escapeHtml(evt.speaker)}</p>` : ''}
    </div>
    <div style="white-space:pre-line; line-height:1.75; color:var(--text-primary); font-size:0.96rem; margin-bottom:24px;">${escapeHtml(evt.content || evt.summary)}</div>
    ${evt.status === 'upcoming' && evt.registrationUrl ? `
      <a href="${escapeHtml(evt.registrationUrl)}" onclick="closeDetailModal()" class="btn btn-primary">Register / Inquire to Attend</a>
    ` : ''}
  `;
  document.getElementById('detail-modal').classList.add('open');
}

function renderTopics() {
  const container = document.getElementById('topics-grid');
  if (!container) return;

  const topics = (siteData.topics || []).filter(t => {
    if (currentTopicFilter === 'all') return true;
    return t.category === currentTopicFilter;
  });

  container.innerHTML = topics.map(t => `
    <article class="topic-card">
      <div class="topic-top">
        <span class="topic-pillar">${escapeHtml(t.category)}</span>
        <span class="topic-read">${escapeHtml(t.readTime || '5 min read')}</span>
      </div>
      <h3 class="topic-title">${escapeHtml(t.title)}</h3>
      <div class="topic-lead">Lead: ${escapeHtml(t.lead || 'IEEE CIS London Working Group')}</div>
      <p class="topic-summary">${escapeHtml(t.summary)}</p>
      <div class="topic-tags">
        ${(t.tags || []).map(tag => `<span class="tag-chip">#${escapeHtml(tag)}</span>`).join('')}
      </div>
      <div class="event-footer">
        <button class="btn btn-outline btn-sm" onclick="openTopicDetail('${escapeHtml(t.id)}')">
          Read Topic Brief &rarr;
        </button>
        <div style="display:flex; gap:6px;">
          ${t.externalLink ? `
            <a href="${escapeHtml(t.externalLink)}" target="_blank" rel="noopener" class="btn btn-sm" style="background:#EDF2F7; color:var(--ieee-navy);">IEEE Publication ↗</a>
          ` : ''}
          ${isAdminLoggedIn ? `
            <button class="btn btn-outline btn-sm" onclick="editTopicById('${escapeHtml(t.id)}')" title="Edit Topic">✏️</button>
          ` : ''}
        </div>
      </div>
    </article>
  `).join('');
}

function filterTopics(category, btn) {
  currentTopicFilter = category;
  document.querySelectorAll('#topic-filters .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderTopics();
}

function openTopicDetail(topicId) {
  const t = (siteData.topics || []).find(item => item.id === topicId);
  if (!t) return;

  document.getElementById('detail-modal-title').textContent = t.category + ' — Research Topic';
  const body = document.getElementById('detail-modal-body');
  body.innerHTML = `
    <span class="topic-pillar" style="display:inline-block; margin-bottom:12px;">${escapeHtml(t.category)}</span>
    <h2 style="font-size:1.55rem; font-weight:800; color:var(--ieee-navy); margin-bottom:8px;">${escapeHtml(t.title)}</h2>
    <p style="font-size:0.88rem; color:var(--text-muted); margin-bottom:18px;">
      <strong>Working Group / Lead:</strong> ${escapeHtml(t.lead)} • Published ${formatDate(t.date)}
    </p>
    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:20px;">
      ${(t.tags || []).map(tag => `<span class="tag-chip">#${escapeHtml(tag)}</span>`).join('')}
    </div>
    <div style="white-space:pre-line; line-height:1.8; color:var(--text-primary); font-size:0.96rem; margin-bottom:24px; background:#F8FAFC; padding:20px; border-radius:12px; border:1px solid var(--border-color);">${escapeHtml(t.content || t.summary)}</div>
    ${t.externalLink ? `
      <a href="${escapeHtml(t.externalLink)}" target="_blank" rel="noopener" class="btn btn-primary">
        Explore Related IEEE CIS Publications ↗
      </a>
    ` : ''}
  `;
  document.getElementById('detail-modal').classList.add('open');
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.remove('open');
}

// ==========================================
// 3. PHOTO GALLERY & LIGHTBOX
// ==========================================
function renderGalleryFilters() {
  const container = document.getElementById('gallery-filters');
  if (!container) return;

  const tags = Array.from(new Set((siteData.gallery || []).map(p => p.eventTag).filter(Boolean)));
  const buttons = ['all', ...tags];

  container.innerHTML = buttons.map(tag => `
    <button class="filter-btn ${currentGalleryFilter === tag ? 'active' : ''}" onclick="filterGallery('${escapeHtml(tag)}')">
      ${tag === 'all' ? 'All Photos' : escapeHtml(tag)}
    </button>
  `).join('');
}

function filterGallery(tag) {
  currentGalleryFilter = tag;
  renderGalleryFilters();
  renderGallery();
}

function renderGallery() {
  const container = document.getElementById('gallery-grid');
  if (!container) return;

  filteredGalleryList = (siteData.gallery || []).filter(item => {
    if (currentGalleryFilter === 'all') return true;
    return item.eventTag === currentGalleryFilter;
  });

  if (filteredGalleryList.length === 0) {
    container.innerHTML = `<p style="grid-column:1/-1; text-align:center; padding:32px; color:var(--text-secondary);">No photos in this album yet.</p>`;
    return;
  }

  container.innerHTML = filteredGalleryList.map((photo, idx) => `
    <div class="gallery-card" onclick="openLightbox(${idx})">
      <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.title)}" loading="lazy" />
      ${isAdminLoggedIn ? `
        <div class="gallery-admin-actions" onclick="event.stopPropagation();">
          <button class="btn btn-danger btn-sm" onclick="deleteGalleryPhoto('${escapeHtml(photo.id)}')">🗑️</button>
        </div>
      ` : ''}
      <div class="gallery-overlay">
        <span class="gallery-tag">${escapeHtml(photo.eventTag || 'Chapter Event')}</span>
        <h4 class="gallery-title">${escapeHtml(photo.title)}</h4>
        <p class="gallery-caption">${escapeHtml(photo.caption)}</p>
      </div>
    </div>
  `).join('');
}

function openLightbox(index) {
  if (!filteredGalleryList.length) return;
  currentLightboxIndex = index;
  updateLightboxView();
  document.getElementById('lightbox-modal').classList.add('open');
}

function updateLightboxView() {
  const item = filteredGalleryList[currentLightboxIndex];
  if (!item) return;
  document.getElementById('lightbox-title').textContent = `${item.title} (${formatDate(item.date)})`;
  document.getElementById('lightbox-img').src = item.url;
  document.getElementById('lightbox-caption').textContent = item.caption;
}

function stepLightbox(direction) {
  if (!filteredGalleryList.length) return;
  currentLightboxIndex = (currentLightboxIndex + direction + filteredGalleryList.length) % filteredGalleryList.length;
  updateLightboxView();
}

function closeLightbox() {
  document.getElementById('lightbox-modal').classList.remove('open');
}

// ==========================================
// 4. EXECUTIVE COMMITTEE RENDERER
// ==========================================
function renderCommittee() {
  const container = document.getElementById('committee-grid');
  if (!container) return;

  container.innerHTML = (siteData.committee || []).map(m => {
    const initials = (m.name || 'IC')
      .replace(/^(Prof\.|Dr\.)\s*/i, '')
      .split(' ')
      .map(p => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return `
      <div class="member-card">
        <div class="member-avatar">${escapeHtml(initials)}</div>
        <div class="member-role">${escapeHtml(m.role)}</div>
        <h3 class="member-name">${escapeHtml(m.name)}</h3>
        <div class="member-affil">${escapeHtml(m.affiliation)}</div>
        <p class="member-bio">${escapeHtml(m.bio)}</p>
      </div>
    `;
  }).join('');
}

// ==========================================
// 5. ADMIN AUTHENTICATION & CMS PORTAL
// ==========================================
function checkAdminSession() {
  const session = sessionStorage.getItem(STORAGE_KEY_AUTH);
  if (session === 'authenticated') {
    setAdminState(true);
  }
  const savedToken = localStorage.getItem(STORAGE_KEY_GH_TOKEN);
  if (savedToken) {
    const syncTokenInput = document.getElementById('sync-token');
    if (syncTokenInput) syncTokenInput.value = savedToken;
  }
}

function setAdminState(loggedIn) {
  isAdminLoggedIn = loggedIn;
  const headerBtn = document.getElementById('admin-Header-Btn');
  const btnLabel = document.getElementById('admin-btn-label');
  const logoutBtn = document.getElementById('admin-logout-btn');
  const loginView = document.getElementById('admin-login-view');
  const dashView = document.getElementById('admin-dashboard-view');
  const floatingBar = document.getElementById('admin-floating-bar');

  if (loggedIn) {
    headerBtn.classList.add('logged-in');
    btnLabel.textContent = 'Admin CMS';
    logoutBtn.style.display = 'inline-flex';
    loginView.style.display = 'none';
    dashView.style.display = 'block';
    floatingBar.classList.add('visible');
    document.querySelectorAll('.admin-only-btn').forEach(el => (el.style.display = 'inline-flex'));
    if (siteData) renderAdminLists();
  } else {
    headerBtn.classList.remove('logged-in');
    btnLabel.textContent = 'Admin Login';
    logoutBtn.style.display = 'none';
    loginView.style.display = 'block';
    dashView.style.display = 'none';
    floatingBar.classList.remove('visible');
    document.querySelectorAll('.admin-only-btn').forEach(el => (el.style.display = 'none'));
  }

  if (siteData) {
    renderEvents();
    renderTopics();
    renderGallery();
  }
}

function openAdminModal() {
  document.getElementById('admin-modal').classList.add('open');
  if (isAdminLoggedIn) {
    renderAdminLists();
  }
}

function closeAdminModal() {
  document.getElementById('admin-modal').classList.remove('open');
}

function openAdminTab(tabName) {
  openAdminModal();
  if (isAdminLoggedIn) {
    switchAdminTab(tabName);
  }
}

function switchAdminTab(tabName) {
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.admin-pane').forEach(pane => {
    pane.style.display = pane.id === `admin-pane-${tabName}` ? 'block' : 'none';
  });
}

function handleAdminLogin(e) {
  e.preventDefault();
  const user = document.getElementById('login-username').value.trim().toLowerCase();
  const pass = document.getElementById('login-password').value.trim();
  const token = document.getElementById('login-gh-token').value.trim();
  const errEl = document.getElementById('login-error');

  if (user === ADMIN_CREDENTIALS.username && ADMIN_CREDENTIALS.passwords.includes(pass)) {
    errEl.style.display = 'none';
    sessionStorage.setItem(STORAGE_KEY_AUTH, 'authenticated');
    if (token) {
      localStorage.setItem(STORAGE_KEY_GH_TOKEN, token);
      document.getElementById('sync-token').value = token;
    }
    setAdminState(true);
    showToast('Welcome! Administrator mode activated.');
  } else {
    errEl.textContent = 'Invalid username or password. Please check your administrator credentials.';
    errEl.style.display = 'block';
  }
}

function handleAdminLogout() {
  sessionStorage.removeItem(STORAGE_KEY_AUTH);
  setAdminState(false);
  closeAdminModal();
  showToast('Logged out of Administrator mode.');
}

// ==========================================
// 6. ADMIN CRUD OPERATIONS & IMAGE UPLOAD
// ==========================================
function renderAdminLists() {
  // Events list
  const evts = siteData.events || [];
  setText('admin-events-count', evts.length);
  const evtList = document.getElementById('admin-events-list');
  if (evtList) {
    evtList.innerHTML = evts.map(ev => `
      <div class="admin-list-item">
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="${escapeHtml(ev.image)}" class="admin-list-thumb" alt="" />
          <div>
            <div style="font-weight:700; color:var(--ieee-navy);">${escapeHtml(ev.title)}</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(ev.date)} • ${escapeHtml(ev.category)} (${escapeHtml(ev.status)})</div>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-outline btn-sm" onclick="editEventById('${escapeHtml(ev.id)}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteEventById('${escapeHtml(ev.id)}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  // Gallery list
  const gal = siteData.gallery || [];
  setText('admin-gallery-count', gal.length);
  const galList = document.getElementById('admin-gallery-list');
  if (galList) {
    galList.innerHTML = gal.map(p => `
      <div class="admin-list-item">
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="${escapeHtml(p.url)}" class="admin-list-thumb" alt="" />
          <div>
            <div style="font-weight:700; color:var(--ieee-navy);">${escapeHtml(p.title)}</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(p.eventTag)} • ${escapeHtml(p.date)}</div>
          </div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteGalleryPhoto('${escapeHtml(p.id)}')">Delete</button>
      </div>
    `).join('');
  }

  // Topics list
  const tops = siteData.topics || [];
  setText('admin-topics-count', tops.length);
  const topList = document.getElementById('admin-topics-list');
  if (topList) {
    topList.innerHTML = tops.map(t => `
      <div class="admin-list-item">
        <div>
          <div style="font-weight:700; color:var(--ieee-navy);">${escapeHtml(t.title)}</div>
          <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(t.category)} • Lead: ${escapeHtml(t.lead)}</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-outline btn-sm" onclick="editTopicById('${escapeHtml(t.id)}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteTopicById('${escapeHtml(t.id)}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  // Committee & Site Meta
  const meta = siteData.siteMeta || {};
  setValue('meta-announcement', meta.announcement || '');
  setValue('meta-herotitle', meta.heroTitle || '');
  setValue('meta-herodesc', meta.heroDescription || '');
  setValue('meta-email', meta.contactEmail || '');
  setValue('meta-location', meta.location || '');
  if (meta.githubRepo) setValue('sync-repo', meta.githubRepo);
  if (meta.githubBranch) setValue('sync-branch', meta.githubBranch);

  const comList = document.getElementById('admin-committee-list');
  if (comList) {
    comList.innerHTML = (siteData.committee || []).map(m => `
      <div class="admin-list-item">
        <div>
          <div style="font-weight:700; color:var(--ieee-navy);">${escapeHtml(m.name)} — <span style="color:var(--ieee-blue);">${escapeHtml(m.role)}</span></div>
          <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(m.affiliation)}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteCommitteeMember('${escapeHtml(m.id)}')">Remove</button>
      </div>
    `).join('');
  }

  // Default today's date in photo upload form if empty
  const galDate = document.getElementById('gal-date');
  if (galDate && !galDate.value) {
    galDate.value = new Date().toISOString().split('T')[0];
  }
}

// --- Event CRUD ---
function saveEventItem(e) {
  e.preventDefault();
  const id = document.getElementById('evt-id').value || ('evt-' + Date.now());
  const newEvt = {
    id,
    title: document.getElementById('evt-title').value.trim(),
    date: document.getElementById('evt-date').value,
    time: document.getElementById('evt-time').value.trim(),
    category: document.getElementById('evt-category').value,
    status: document.getElementById('evt-status').value,
    location: document.getElementById('evt-location').value.trim(),
    speaker: document.getElementById('evt-speaker').value.trim(),
    registrationUrl: document.getElementById('evt-reg').value.trim(),
    image: document.getElementById('evt-image').value.trim() || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1000&q=80',
    summary: document.getElementById('evt-summary').value.trim(),
    content: document.getElementById('evt-content').value.trim()
  };

  const idx = siteData.events.findIndex(item => item.id === id);
  if (idx >= 0) {
    siteData.events[idx] = newEvt;
    showToast('Event updated! Click "Publish Live" to sync to GitHub Pages.');
  } else {
    siteData.events.unshift(newEvt);
    showToast('New event added! Click "Publish Live" to sync to GitHub Pages.');
  }

  resetEventForm();
  saveDataLocally();
}

function editEventById(id) {
  const ev = siteData.events.find(item => item.id === id);
  if (!ev) return;
  openAdminTab('events');
  setValue('evt-id', ev.id);
  setValue('evt-title', ev.title);
  setValue('evt-date', ev.date);
  setValue('evt-time', ev.time);
  setValue('evt-category', ev.category);
  setValue('evt-status', ev.status);
  setValue('evt-location', ev.location);
  setValue('evt-speaker', ev.speaker || '');
  setValue('evt-reg', ev.registrationUrl || '');
  setValue('evt-image', ev.image || '');
  setValue('evt-summary', ev.summary);
  setValue('evt-content', ev.content || ev.summary);
  document.getElementById('evt-submit-btn').textContent = 'Update Event';
  document.getElementById('event-form').scrollIntoView({ behavior: 'smooth' });
}

function resetEventForm() {
  document.getElementById('event-form').reset();
  setValue('evt-id', '');
  document.getElementById('evt-submit-btn').textContent = 'Save Event';
}

function deleteEventById(id) {
  if (!confirm('Are you sure you want to delete this event?')) return;
  siteData.events = siteData.events.filter(item => item.id !== id);
  saveDataLocally();
  showToast('Event removed.');
}

async function handleEventCoverUpload(input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await compressImageFile(file, 1200, 0.82);
    setValue('evt-image', dataUrl);
    showToast('Event cover image processed and ready!');
  } catch (err) {
    showToast('Failed to read image file.');
  }
}

// --- Gallery Photo Upload & CRUD ---
function setupDragAndDrop() {
  const dropzone = document.getElementById('photo-dropzone');
  if (!dropzone) return;

  dropzone.addEventListener('dragover', e => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });
  dropzone.addEventListener('drop', async e => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await processGalleryFile(file);
    }
  });
}

async function handleGalleryFileSelect(input) {
  const file = input.files?.[0];
  if (file) {
    await processGalleryFile(file);
  }
}

async function processGalleryFile(file) {
  try {
    const compressedDataUrl = await compressImageFile(file, 1280, 0.84);
    setValue('gal-url', compressedDataUrl);
    const preview = document.getElementById('gallery-upload-preview');
    if (preview) {
      preview.src = compressedDataUrl;
      preview.style.display = 'block';
    }
    const titleInput = document.getElementById('gal-title');
    if (titleInput && !titleInput.value) {
      titleInput.value = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    }
    showToast('Photo optimized and ready to add!');
  } catch (err) {
    console.error(err);
    showToast('Error processing image file.');
  }
}

function saveGalleryItem(e) {
  e.preventDefault();
  const newPhoto = {
    id: 'photo-' + Date.now(),
    title: document.getElementById('gal-title').value.trim(),
    eventTag: document.getElementById('gal-tag').value.trim(),
    date: document.getElementById('gal-date').value,
    url: document.getElementById('gal-url').value.trim(),
    caption: document.getElementById('gal-caption').value.trim()
  };

  siteData.gallery.unshift(newPhoto);
  document.getElementById('gallery-form').reset();
  document.getElementById('gal-date').value = new Date().toISOString().split('T')[0];
  const preview = document.getElementById('gallery-upload-preview');
  if (preview) preview.style.display = 'none';

  saveDataLocally();
  showToast('Photo added to gallery! Click "Publish Live" to push to GitHub Pages.');
}

function deleteGalleryPhoto(id) {
  if (!confirm('Remove this photo from the gallery?')) return;
  siteData.gallery = siteData.gallery.filter(p => p.id !== id);
  saveDataLocally();
  showToast('Photo deleted.');
}

// --- Topic CRUD ---
function saveTopicItem(e) {
  e.preventDefault();
  const id = document.getElementById('top-id').value || ('topic-' + Date.now());
  const rawTags = document.getElementById('top-tags').value;
  const tags = rawTags
    ? rawTags.split(',').map(s => s.trim()).filter(Boolean)
    : ['Computational Intelligence'];

  const newTopic = {
    id,
    title: document.getElementById('top-title').value.trim(),
    category: document.getElementById('top-category').value,
    lead: document.getElementById('top-lead').value.trim(),
    date: new Date().toISOString().split('T')[0],
    readTime: '5 min read',
    tags,
    externalLink: document.getElementById('top-link').value.trim(),
    summary: document.getElementById('top-summary').value.trim(),
    content: document.getElementById('top-content').value.trim()
  };

  const idx = siteData.topics.findIndex(t => t.id === id);
  if (idx >= 0) {
    siteData.topics[idx] = newTopic;
    showToast('Research topic updated!');
  } else {
    siteData.topics.unshift(newTopic);
    showToast('New research topic published!');
  }

  resetTopicForm();
  saveDataLocally();
}

function editTopicById(id) {
  const t = siteData.topics.find(item => item.id === id);
  if (!t) return;
  openAdminTab('topics');
  setValue('top-id', t.id);
  setValue('top-title', t.title);
  setValue('top-category', t.category);
  setValue('top-lead', t.lead);
  setValue('top-tags', (t.tags || []).join(', '));
  setValue('top-link', t.externalLink || '');
  setValue('top-summary', t.summary);
  setValue('top-content', t.content || t.summary);
  document.getElementById('top-submit-btn').textContent = 'Update Topic';
  document.getElementById('topic-form').scrollIntoView({ behavior: 'smooth' });
}

function resetTopicForm() {
  document.getElementById('topic-form').reset();
  setValue('top-id', '');
  document.getElementById('top-submit-btn').textContent = 'Save Topic';
}

function deleteTopicById(id) {
  if (!confirm('Delete this research topic?')) return;
  siteData.topics = siteData.topics.filter(t => t.id !== id);
  saveDataLocally();
  showToast('Topic deleted.');
}

// --- Site Meta & Committee CRUD ---
function saveSiteMeta(e) {
  e.preventDefault();
  siteData.siteMeta.announcement = document.getElementById('meta-announcement').value.trim();
  siteData.siteMeta.heroTitle = document.getElementById('meta-herotitle').value.trim();
  siteData.siteMeta.heroDescription = document.getElementById('meta-herodesc').value.trim();
  siteData.siteMeta.contactEmail = document.getElementById('meta-email').value.trim();
  siteData.siteMeta.location = document.getElementById('meta-location').value.trim();
  saveDataLocally();
  showToast('Homepage banner and chapter info updated!');
}

function saveCommitteeMember(e) {
  e.preventDefault();
  siteData.committee.push({
    id: 'mem-' + Date.now(),
    name: document.getElementById('mem-name').value.trim(),
    role: document.getElementById('mem-role').value.trim(),
    affiliation: document.getElementById('mem-affil').value.trim(),
    bio: document.getElementById('mem-bio').value.trim()
  });
  e.target.reset();
  saveDataLocally();
  showToast('Committee member added!');
}

function deleteCommitteeMember(id) {
  siteData.committee = siteData.committee.filter(m => m.id !== id);
  saveDataLocally();
  showToast('Committee member removed.');
}

// ==========================================
// 7. GITHUB PAGES CLOUD SYNC (LIVE PUBLISH)
// ==========================================
async function syncToGitHubCloud() {
  const repo = (document.getElementById('sync-repo')?.value || siteData.siteMeta?.githubRepo || 'sankunliu/IEEE_London_CIS_section').trim();
  const branch = (document.getElementById('sync-branch')?.value || siteData.siteMeta?.githubBranch || 'main').trim();
  const token = (document.getElementById('sync-token')?.value || localStorage.getItem(STORAGE_KEY_GH_TOKEN) || '').trim();
  const statusEl = document.getElementById('sync-status-msg');

  if (!token) {
    openAdminTab('publish');
    if (statusEl) {
      statusEl.style.color = 'var(--danger)';
      statusEl.textContent = '⚠️ Please enter your GitHub Personal Access Token above to publish directly to the live GitHub Pages repository.';
    }
    showToast('Please enter your GitHub Token in the Cloud Sync tab to publish live.');
    return;
  }

  localStorage.setItem(STORAGE_KEY_GH_TOKEN, token);

  try {
    if (statusEl) {
      statusEl.style.color = 'var(--ieee-blue)';
      statusEl.textContent = '⏳ Uploading new photos & syncing data to GitHub Pages...';
    }
    showToast('Publishing changes to GitHub Pages...');

    // 1. Upload any base64 images in gallery or events to uploads/ folder in the repo
    for (const photo of siteData.gallery) {
      if (photo.url && photo.url.startsWith('data:image/')) {
        const uploadedPath = await uploadBase64ImageToGitHub(repo, branch, token, photo.url, `uploads/gallery-${photo.id}.jpg`);
        photo.url = uploadedPath;
      }
    }

    for (const evt of siteData.events) {
      if (evt.image && evt.image.startsWith('data:image/')) {
        const uploadedPath = await uploadBase64ImageToGitHub(repo, branch, token, evt.image, `uploads/event-${evt.id}.jpg`);
        evt.image = uploadedPath;
      }
    }

    // 2. Commit updated data/site-data.json to GitHub
    const filePath = 'data/site-data.json';
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;

    let currentSha = null;
    const getRes = await fetch(`${apiUrl}?ref=${branch}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json'
      }
    });

    if (getRes.ok) {
      const fileMeta = await getRes.json();
      currentSha = fileMeta.sha;
    }

    const jsonString = JSON.stringify(siteData, null, 2);
    const base64Content = btoa(unescape(encodeURIComponent(jsonString)));

    const putBody = {
      message: `CMS Update: Published via IEEE CIS London Admin Portal (${new Date().toISOString()})`,
      content: base64Content,
      branch
    };
    if (currentSha) putBody.sha = currentSha;

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putBody)
    });

    if (!putRes.ok) {
      const errData = await putRes.json();
      throw new Error(errData.message || 'GitHub API commit failed');
    }

    saveDataLocally();
    if (statusEl) {
      statusEl.style.color = 'var(--success)';
      statusEl.textContent = '✅ Successfully published to GitHub! Live site will refresh within ~30–60 seconds.';
    }
    showToast('✅ Published live to GitHub Pages!');
  } catch (err) {
    console.error(err);
    if (statusEl) {
      statusEl.style.color = 'var(--danger)';
      statusEl.textContent = `❌ Sync error: ${err.message}`;
    }
    showToast(`Sync failed: ${err.message}`);
  }
}

async function uploadBase64ImageToGitHub(repo, branch, token, dataUrl, targetPath) {
  const base64Data = dataUrl.split(',')[1];
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${targetPath}`;

  let sha = null;
  const checkRes = await fetch(`${apiUrl}?ref=${branch}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json'
    }
  });
  if (checkRes.ok) {
    const existing = await checkRes.json();
    sha = existing.sha;
  }

  const body = {
    message: `Upload photo ${targetPath} via Admin CMS`,
    content: base64Data,
    branch
  };
  if (sha) body.sha = sha;

  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`Failed to upload image ${targetPath}`);
  }
  return targetPath;
}

function exportSiteDataJson() {
  const blob = new Blob([JSON.stringify(siteData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'site-data.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Downloaded site-data.json backup.');
}

function resetLocalChanges() {
  if (!confirm('Discard unsynced browser edits and reload from the server?')) return;
  localStorage.removeItem(STORAGE_KEY_DATA);
  location.reload();
}

// ==========================================
// 8. UTILITIES & IMAGE COMPRESSION
// ==========================================
function compressImageFile(file, maxWidth = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
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

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function showToast(msg) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function toggleMobileNav() {
  document.getElementById('nav-menu').classList.toggle('open');
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const lightbox = document.getElementById('lightbox-modal');
    if (lightbox && lightbox.classList.contains('open')) {
      if (e.key === 'ArrowLeft') stepLightbox(-1);
      if (e.key === 'ArrowRight') stepLightbox(1);
      if (e.key === 'Escape') closeLightbox();
    }
  });
}

// ==========================================
// 9. INTERACTIVE NEURAL NETWORK HERO CANVAS
// ==========================================
function initNeuralCanvas() {
  const canvas = document.getElementById('neural-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width = (canvas.width = canvas.parentElement.offsetWidth);
  let height = (canvas.height = canvas.parentElement.offsetHeight);

  const nodes = Array.from({ length: 42 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.6,
    vy: (Math.random() - 0.5) * 0.6,
    r: Math.random() * 2.2 + 1.2
  }));

  window.addEventListener('resize', () => {
    width = canvas.width = canvas.parentElement.offsetWidth;
    height = canvas.height = canvas.parentElement.offsetHeight;
  });

  function draw() {
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      a.x += a.vx;
      a.y += a.vy;
      if (a.x < 0 || a.x > width) a.vx *= -1;
      if (a.y < 0 || a.y > height) a.vy *= -1;

      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.fillStyle = '#00B5E2';
      ctx.fill();

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 145) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(0, 181, 226, ${0.22 * (1 - dist / 145)})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}
