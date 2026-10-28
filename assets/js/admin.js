/**
 * IEEE CIS London Section Chapter — admin editing.
 *
 * No credentials live in this file. Admins sign in either
 *  - with a username and password, checked by the chapter's Cloudflare Worker (worker/), which
 *    holds the GitHub token server-side and forwards only the allowed GitHub requests; or
 *  - with their own GitHub fine-grained token, which GitHub checks directly.
 * "Publish" commits data/site-data.json (and uploaded images) through the GitHub Contents API;
 * GitHub Pages then redeploys the site, usually within a minute.
 */
'use strict';

const ADMIN_API = 'https://cis-london-admin.bigboobmilkworld.workers.dev'; // Cloudflare Worker (worker/)
const ADMIN_REPO = 'IEEE-CIS-London/IEEE-CIS-London.github.io';
const ADMIN_BRANCH = 'main';
const DATA_PATH = 'data/site-data.json';
const SESSION_KEY = 'ieee_cis_london_admin_session';

const admin = {
  mode: '',          // 'password' (via the Worker) or 'token' (direct to GitHub)
  credential: '',    // Worker session or GitHub token
  user: '',
  dataSha: '',       // sha of data/site-data.json the edits are based on
  dirty: false,
  pendingImages: new Map(), // repo path -> base64 JPEG, uploaded on publish
  previews: new Map()       // repo path -> data: URL, so new images show before they are published
};

let editingEventImages = [];

function initAdmin() {
  document.addEventListener('click', onAdminClick);
  document.querySelectorAll('[data-admin-form]').forEach(form => form.addEventListener('submit', onAdminSubmit));
  const eventFileInput = document.querySelector('[data-admin-form="event"] input[name="imageFile"]');
  if (eventFileInput) {
    eventFileInput.addEventListener('change', onEventFilesSelected);
  }
  window.addEventListener('beforeunload', e => {
    if (admin.dirty) e.preventDefault();
  });

  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { /* storage unavailable */ }
  if (saved?.credential) {
    Object.assign(admin, { mode: saved.mode, credential: saved.credential, user: saved.user });
    startAdmin().catch(() => forgetSession());
  }
}

// ---------- GitHub API (directly, or through the Worker) ----------

async function gh(path, options = {}) {
  const base = admin.mode === 'password' ? `${ADMIN_API}/github` : 'https://api.github.com';
  const res = await fetch(`${base}${path}`, {
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${admin.credential}`,
      ...(admin.mode === 'token' ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    }
  });
  if (!res.ok) {
    let message = `GitHub API error ${res.status}`;
    try { message = (await res.json()).message || message; } catch { /* non-JSON body */ }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

// ---------- Sign in / out ----------

async function signInWithPassword(username, password) {
  if (!ADMIN_API) throw new Error('Password sign-in is not set up yet. Use a GitHub token instead.');
  if (!username || !password) throw new Error('Please enter your username and password.');
  const res = await fetch(`${ADMIN_API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Sign-in failed (${res.status}).`);
  Object.assign(admin, { mode: 'password', credential: body.session, user: body.username });
  await startAdmin();
}

async function signInWithToken(token) {
  Object.assign(admin, { mode: 'token', credential: token, user: '' });
  const repo = await gh(`/repos/${ADMIN_REPO}`);
  if (!repo.permissions?.push) throw new Error('This token cannot write to the website repository.');
  try {
    admin.user = (await gh('/user')).login;
  } catch {
    admin.user = 'GitHub token'; // fine-grained tokens may not be allowed to read the profile
  }
  await startAdmin();
}

async function startAdmin() {
  // Edit on top of the latest committed data, not the (possibly cached) deployed copy
  const file = await gh(`/repos/${ADMIN_REPO}/contents/${DATA_PATH}?ref=${ADMIN_BRANCH}`);
  state.data = { ...state.data, ...JSON.parse(base64ToUtf8(file.content)) };
  admin.dataSha = file.sha;

  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ mode: admin.mode, credential: admin.credential, user: admin.user }));
  } catch { /* storage unavailable */ }
  state.admin = true;
  document.body.classList.add('is-admin');
  document.querySelectorAll('.admin-only').forEach(el => { el.hidden = false; });
  document.getElementById('admin-bar').hidden = false;
  setText('admin-user', admin.user);
  setDirty(false);
  renderAll();
}

function forgetSession() {
  Object.assign(admin, { mode: '', credential: '', user: '' });
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('ieee_cis_london_draft_data');
    sessionStorage.removeItem('ieee_cis_london_draft_previews');
  } catch { /* storage unavailable */ }
}

function signOut() {
  if (admin.dirty && !confirm('You have unpublished changes. Sign out and discard them?')) return;
  forgetSession();
  admin.dirty = false;
  location.reload();
}

function setDirty(dirty) {
  admin.dirty = dirty;
  document.querySelector('[data-admin="publish"]').disabled = !dirty;
  setText('admin-status', dirty ? 'Unpublished changes' : 'All changes published');
  try {
    sessionStorage.setItem('ieee_cis_london_draft_data', JSON.stringify(state.data));
    sessionStorage.setItem('ieee_cis_london_draft_previews', JSON.stringify(Object.fromEntries(admin.previews)));
  } catch { /* storage unavailable */ }
}

// ---------- Event handlers ----------

function onAdminClick(e) {
  const btn = e.target.closest('[data-admin]');
  if (!btn) return;
  const action = btn.dataset.admin;

  if (action === 'sign-in') {
    if (state.admin) return toast(`Already signed in as ${admin.user}.`);
    return openForm('admin-signin');
  }
  if (!state.admin) return;

  switch (action) {
    case 'new-event': return openEventEditor();
    case 'new-past-event': return openEventEditor(null, 'past');
    case 'edit-event': return openEventEditor(btn.dataset.id);
    case 'delete-event': return deleteEvent();
    case 'remove-event-image': return removeEventImage(Number(btn.dataset.index));
    case 'make-cover-image': return makeCoverEventImage(Number(btn.dataset.index));
    case 'new-photo': return openPhotoEditor();
    case 'delete-photo': return deletePhoto(Number(btn.dataset.index));
    case 'edit-stats': return openStatsEditor();
    case 'add-stat': return addStatRow({ value: '', label: '' });
    case 'remove-stat': return btn.closest('.stat-row').remove();
    case 'publish': return publish(btn);
    case 'sign-out': return signOut();
  }
}

async function onAdminSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const kind = form.dataset.adminForm;
  const submitBtns = [...form.querySelectorAll('[type="submit"]')];
  const saveAnother = e.submitter?.dataset.saveAnother === '1';
  showFormError(form, '');
  submitBtns.forEach(b => { b.disabled = true; });
  try {
    if (kind === 'sign-in') {
      const token = form.elements.token.value.trim();
      if (token) await signInWithToken(token);
      else await signInWithPassword(form.elements.username.value.trim(), form.elements.password.value);
      form.reset();
      form.closest('dialog').close();
      toast(`Signed in as ${admin.user}. You can now edit events and stats.`);
    } else if (kind === 'event') {
      const prevStatus = form.elements.status?.value || '';
      await saveEvent(form);
      if (saveAnother) {
        resetEventFormForNext(form, prevStatus);
      } else {
        form.closest('dialog').close();
      }
    } else if (kind === 'photo') {
      await savePhotos(form);
      form.closest('dialog').close();
    } else if (kind === 'stats') {
      saveStats();
      form.closest('dialog').close();
    }
  } catch (err) {
    if (kind === 'sign-in') {
      const usedToken = admin.mode === 'token';
      forgetSession();
      if (usedToken && err.status === 401) err.message = 'GitHub rejected this token (invalid or expired).';
    }
    showFormError(form, err.message);
  } finally {
    submitBtns.forEach(b => { b.disabled = false; });
  }
}

function openForm(id) {
  const dialog = document.getElementById(id);
  showFormError(dialog.querySelector('form'), '');
  dialog.showModal();
}

function showFormError(form, message) {
  const el = form.querySelector('[data-form-error]');
  if (!el) {
    if (message) toast(message);
    return;
  }
  el.textContent = message;
  el.hidden = !message;
}

// ---------- Events ----------

function openEventEditor(id, defaultStatus = '') {
  const form = document.querySelector('[data-admin-form="event"]');
  form.reset();
  const evt = id ? findEvent(id) : null;
  setText('event-editor-title', evt ? 'Edit event' : defaultStatus === 'past' ? 'Add past event' : 'New event');
  form.querySelector('[data-admin="delete-event"]').hidden = !evt;
  for (const name of ['id', 'title', 'date', 'status', 'category', 'startTime', 'endTime', 'location', 'speaker', 'speakerBio', 'registrationUrl', 'summary', 'description', 'image']) {
    if (form.elements[name]) form.elements[name].value = evt?.[name] || '';
  }
  if (!evt && defaultStatus && form.elements.status) {
    form.elements.status.value = defaultStatus;
  }
  editingEventImages = evt
    ? [...new Set([...(Array.isArray(evt.images) ? evt.images : []), ...(evt.image ? [evt.image] : [])].filter(Boolean))]
    : [];
  // Only keep manual external URL in the text box if it's not an uploaded repo path
  if (form.elements.image && /^assets\/uploads\//.test(form.elements.image.value)) {
    form.elements.image.value = '';
  }
  renderEventImagesList();
  document.getElementById('event-dialog').close();
  openForm('event-editor');
}

function resetEventFormForNext(form, defaultStatus = '') {
  form.reset();
  setText('event-editor-title', defaultStatus === 'past' ? 'Add another past event' : 'Add another event');
  form.querySelector('[data-admin="delete-event"]').hidden = true;
  if (defaultStatus && form.elements.status) {
    form.elements.status.value = defaultStatus;
  }
  editingEventImages = [];
  renderEventImagesList();
  form.elements.title?.focus();
}

function renderEventImagesList() {
  const field = document.getElementById('event-images-field');
  const list = document.getElementById('event-images-list');
  if (!field || !list) return;
  field.hidden = editingEventImages.length === 0;
  list.innerHTML = editingEventImages.map((url, i) => `
    <div class="event-image-item${i === 0 ? ' is-cover' : ''}">
      <img src="${escapeHtml(mediaUrl(url))}" alt="Event photo ${i + 1}" />
      <div class="event-image-item-bar">
        ${i === 0
          ? `<span class="event-image-badge">Cover</span>`
          : `<button type="button" class="event-image-btn" data-admin="make-cover-image" data-index="${i}" title="Set as cover image">Set cover</button>`}
        <button type="button" class="event-image-btn event-image-remove" data-admin="remove-event-image" data-index="${i}" aria-label="Remove photo ${i + 1}">&times;</button>
      </div>
    </div>`).join('');
}

function removeEventImage(index) {
  if (index < 0 || index >= editingEventImages.length) return;
  editingEventImages.splice(index, 1);
  renderEventImagesList();
}

function makeCoverEventImage(index) {
  if (index <= 0 || index >= editingEventImages.length) return;
  const [picked] = editingEventImages.splice(index, 1);
  editingEventImages.unshift(picked);
  renderEventImagesList();
}

async function onEventFilesSelected(e) {
  const input = e.target;
  const form = input.closest('form');
  const files = [...(input.files || [])];
  if (!files.length) return;
  try {
    showFormError(form, '');
    const slugBase = sanitizeEventSlug(form.elements.id?.value || form.elements.title?.value || 'event');
    const stamp = Date.now().toString(36);
    const paths = await Promise.all(
      files.map((file, i) => stageImage(file, `assets/uploads/events/${slugBase}-${stamp}-${i}.jpg`))
    );
    editingEventImages.push(...paths);
    input.value = '';
    renderEventImagesList();
  } catch (err) {
    showFormError(form, err.message);
  }
}

function sanitizeEventSlug(raw) {
  return String(raw || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event';
}

async function saveEvent(form) {
  const f = form.elements;
  const value = name => (f[name] ? f[name].value.trim() : '');
  if (value('endTime') && !value('startTime')) throw new Error('Please add a start time, or clear the end time.');
  if (value('startTime') && value('endTime') && value('endTime') <= value('startTime')) throw new Error('End time must be after the start time.');

  const existing = value('id') ? findEvent(value('id')) : null;
  const id = existing ? existing.id : uniqueEventId(value('date'), value('title'));

  const files = [...(f.imageFile?.files || [])];
  if (files.length) {
    const stamp = Date.now().toString(36);
    const uploaded = await Promise.all(
      files.map((file, i) => stageImage(file, `assets/uploads/events/${id}-${stamp}-${i}.jpg`))
    );
    editingEventImages.push(...uploaded);
    f.imageFile.value = '';
  }

  const manualUrl = value('image');
  const allImages = [...editingEventImages];
  if (manualUrl && !allImages.includes(manualUrl)) {
    allImages.unshift(manualUrl);
  }

  const evt = { id };
  for (const name of ['title', 'date', 'status', 'category', 'startTime', 'endTime', 'location', 'speaker', 'speakerBio', 'registrationUrl', 'summary', 'description']) {
    if (value(name)) evt[name] = value(name);
  }
  if (allImages.length > 0) {
    evt.image = allImages[0];
    if (allImages.length > 1) evt.images = allImages;
  }

  const events = state.data.events || (state.data.events = []);
  const index = events.findIndex(e => e.id === id);
  if (index >= 0) events[index] = evt;
  else events.push(evt);
  events.sort((a, b) => a.date.localeCompare(b.date));

  setDirty(true);
  renderAll();
  toast(`Saved “${evt.title}” (${events.length} total). Click “Publish changes” when you are ready to publish all edits.`);
}

function deleteEvent() {
  const form = document.querySelector('[data-admin-form="event"]');
  const id = form.elements.id.value;
  const evt = findEvent(id);
  if (!evt || !confirm(`Delete “${evt.title}”?`)) return;
  state.data.events = state.data.events.filter(e => e.id !== id);
  form.closest('dialog').close();
  setDirty(true);
  renderAll();
  toast('Event deleted. Click “Publish changes” to update the live site.');
}

function uniqueEventId(date, title) {
  const slug = `${date}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  let id = slug || `event-${Date.now()}`;
  for (let n = 2; findEvent(id); n++) id = `${slug}-${n}`;
  return id;
}

async function stageImage(file, path) {
  const base64 = await compressImage(file, 1600, 0.82);
  admin.pendingImages.set(path, base64);
  admin.previews.set(path, `data:image/jpeg;base64,${base64}`);
  return path;
}

function compressImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      // Re-encoding through a canvas also strips EXIF metadata such as GPS location
      resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image file.')); };
    img.src = url;
  });
}

// ---------- Gallery ----------

function openPhotoEditor() {
  const form = document.querySelector('[data-admin-form="photo"]');
  form.reset();
  form.elements.date.value = todayIso();
  const albums = [...new Set((state.data.gallery || []).map(p => p.eventTag).filter(Boolean))];
  document.getElementById('photo-albums').innerHTML = albums.map(a => `<option value="${escapeHtml(a)}"></option>`).join('');
  openForm('photo-editor');
}

async function savePhotos(form) {
  const f = form.elements;
  const files = [...f.files.files];
  if (!files.length) throw new Error('Please choose at least one photo.');
  const album = f.eventTag.value.trim();
  const slug = album.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo';
  const gallery = state.data.gallery || (state.data.gallery = []);

  for (const [i, file] of files.entries()) {
    const url = await stageImage(file, `assets/uploads/gallery/${slug}-${Date.now().toString(36)}-${i}.jpg`);
    const photo = { url, title: f.title.value.trim() || album, eventTag: album };
    if (f.date.value) photo.date = f.date.value;
    if (f.caption.value.trim()) photo.caption = f.caption.value.trim();
    gallery.unshift(photo);
  }

  setDirty(true);
  renderAll();
  toast(`Added ${files.length} photo${files.length > 1 ? 's' : ''}. Click “Publish changes” to put them on the live site.`);
}

function deletePhoto(index) {
  const photo = state.data.gallery?.[index];
  if (!photo || !confirm(`Remove “${photo.title || 'this photo'}” from the gallery?`)) return;
  state.data.gallery.splice(index, 1);
  setDirty(true);
  renderAll();
  toast('Photo removed. Click “Publish changes” to update the live site.');
}

// ---------- Stats ----------

function openStatsEditor() {
  const rows = document.getElementById('stats-rows');
  rows.innerHTML = '';
  (state.data.siteMeta?.stats || []).forEach(addStatRow);
  openForm('stats-editor');
}

function addStatRow(stat) {
  const row = document.createElement('div');
  row.className = 'stat-row';
  row.innerHTML = `
    <label class="field"><span>Value</span><input name="value" placeholder="e.g. 120+" /></label>
    <label class="field"><span>Label</span><input name="label" placeholder="e.g. Active CIS members" /></label>
    <button type="button" class="btn btn-outline btn-sm" data-admin="remove-stat" aria-label="Remove stat">Remove</button>`;
  row.querySelector('[name="value"]').value = stat.value || '';
  row.querySelector('[name="label"]').value = stat.label || '';
  document.getElementById('stats-rows').appendChild(row);
}

function saveStats() {
  const stats = [...document.querySelectorAll('#stats-rows .stat-row')]
    .map(row => ({
      value: row.querySelector('[name="value"]').value.trim(),
      label: row.querySelector('[name="label"]').value.trim()
    }))
    .filter(s => s.label);
  state.data.siteMeta = { ...state.data.siteMeta, stats };
  setDirty(true);
  renderAll();
  toast('Stats updated. Click “Publish changes” to update the live site.');
}

// ---------- Publish ----------

async function publish(btn) {
  btn.disabled = true;
  setText('admin-status', 'Publishing…');
  try {
    const latest = await gh(`/repos/${ADMIN_REPO}/contents/${DATA_PATH}?ref=${ADMIN_BRANCH}`);
    if (latest.sha !== admin.dataSha) {
      throw new Error('Someone else published changes since you signed in. Copy your edits, sign out and sign in again to continue.');
    }

    const toUpload = [...admin.pendingImages.entries()].filter(([path]) =>
      (state.data.events || []).some(e => e.image === path || (Array.isArray(e.images) && e.images.includes(path))) ||
      (state.data.gallery || []).some(p => p.url === path)
    );
    admin.pendingImages.clear();

    for (const [idx, [path, content]] of toUpload.entries()) {
      setText('admin-status', `Uploading photo ${idx + 1}/${toUpload.length}…`);
      await gh(`/repos/${ADMIN_REPO}/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify({ message: `Upload ${path}`, content, branch: ADMIN_BRANCH })
      });
    }

    const { siteMeta, events, gallery, committee } = state.data;
    const json = JSON.stringify({ siteMeta, events, gallery, committee }, null, 2) + '\n';
    const result = await gh(`/repos/${ADMIN_REPO}/contents/${DATA_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Update site content (via admin by ${admin.user})`,
        content: utf8ToBase64(json),
        sha: admin.dataSha,
        branch: ADMIN_BRANCH
      })
    });
    admin.dataSha = result.content.sha;
    setDirty(false);
    toast('Published. The live site updates in about a minute.');
  } catch (err) {
    setDirty(true);
    setText('admin-status', 'Publish failed');
    toast(`Publish failed: ${err.message}`, 8000);
  }
}

// ---------- Toast ----------

let toastTimer;
function toast(message, ms = 4500) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
