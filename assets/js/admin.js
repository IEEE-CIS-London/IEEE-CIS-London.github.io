/**
 * IEEE CIS London Section Chapter — admin editing.
 *
 * There is no password in this file. Admins sign in with a GitHub fine-grained token;
 * GitHub itself checks that the token can push to the repository, and "Publish" commits
 * data/site-data.json (and any uploaded images) through the GitHub Contents API.
 * GitHub Pages then redeploys the site, usually within a minute.
 */
'use strict';

const ADMIN_REPO = 'IEEE-CIS-London/ieee-cis-london.github.io';
const ADMIN_BRANCH = 'main';
const DATA_PATH = 'data/site-data.json';
const TOKEN_KEY = 'ieee_cis_london_admin_token';

const admin = {
  token: '',
  user: '',
  dataSha: '',       // sha of data/site-data.json the edits are based on
  dirty: false,
  pendingImages: new Map() // repo path -> base64 JPEG, uploaded on publish
};

function initAdmin() {
  document.addEventListener('click', onAdminClick);
  document.querySelectorAll('[data-admin-form]').forEach(form => form.addEventListener('submit', onAdminSubmit));
  window.addEventListener('beforeunload', e => {
    if (admin.dirty) e.preventDefault();
  });

  let saved = '';
  try { saved = sessionStorage.getItem(TOKEN_KEY) || ''; } catch { /* storage unavailable */ }
  if (saved) signIn(saved).catch(() => forgetToken());
}

// ---------- GitHub API ----------

async function gh(path, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${admin.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
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

async function signIn(token) {
  admin.token = token;
  const repo = await gh(`/repos/${ADMIN_REPO}`);
  if (!repo.permissions?.push) {
    admin.token = '';
    throw new Error('This token cannot write to the website repository.');
  }

  // Edit on top of the latest committed data, not the (possibly cached) deployed copy
  const file = await gh(`/repos/${ADMIN_REPO}/contents/${DATA_PATH}?ref=${ADMIN_BRANCH}`);
  state.data = { ...state.data, ...JSON.parse(base64ToUtf8(file.content)) };
  admin.dataSha = file.sha;

  try {
    const me = await gh('/user');
    admin.user = me.login;
  } catch {
    admin.user = 'GitHub token'; // fine-grained tokens may not be allowed to read the profile
  }

  try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* storage unavailable */ }
  state.admin = true;
  document.body.classList.add('is-admin');
  document.querySelectorAll('.admin-only').forEach(el => { el.hidden = false; });
  document.getElementById('admin-bar').hidden = false;
  setText('admin-user', admin.user);
  setDirty(false);
  renderAll();
}

function forgetToken() {
  admin.token = '';
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
}

function signOut() {
  if (admin.dirty && !confirm('You have unpublished changes. Sign out and discard them?')) return;
  forgetToken();
  admin.dirty = false;
  location.reload();
}

function setDirty(dirty) {
  admin.dirty = dirty;
  document.querySelector('[data-admin="publish"]').disabled = !dirty;
  setText('admin-status', dirty ? 'Unpublished changes' : 'All changes published');
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
    case 'edit-event': return openEventEditor(btn.dataset.id);
    case 'delete-event': return deleteEvent();
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
  const submit = form.querySelector('[type="submit"]');
  showFormError(form, '');
  submit.disabled = true;
  try {
    if (kind === 'sign-in') {
      await signIn(form.elements.token.value.trim());
      form.reset();
      form.closest('dialog').close();
      toast(`Signed in as ${admin.user}. You can now edit events and stats.`);
    } else if (kind === 'event') {
      await saveEvent(form);
      form.closest('dialog').close();
    } else if (kind === 'stats') {
      saveStats();
      form.closest('dialog').close();
    }
  } catch (err) {
    if (kind === 'sign-in') forgetToken();
    showFormError(form, err.status === 401 ? 'GitHub rejected this token (invalid or expired).' : err.message);
  } finally {
    submit.disabled = false;
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

function openEventEditor(id) {
  const form = document.querySelector('[data-admin-form="event"]');
  form.reset();
  const evt = id ? findEvent(id) : null;
  setText('event-editor-title', evt ? 'Edit event' : 'New event');
  form.querySelector('[data-admin="delete-event"]').hidden = !evt;
  for (const name of ['id', 'title', 'date', 'category', 'startTime', 'endTime', 'location', 'speaker', 'registrationUrl', 'summary', 'description', 'image']) {
    form.elements[name].value = evt?.[name] || '';
  }
  document.getElementById('event-dialog').close();
  openForm('event-editor');
}

async function saveEvent(form) {
  const f = form.elements;
  const value = name => f[name].value.trim();
  if (value('endTime') && !value('startTime')) throw new Error('Please add a start time, or clear the end time.');
  if (value('startTime') && value('endTime') && value('endTime') <= value('startTime')) throw new Error('End time must be after the start time.');

  const existing = value('id') ? findEvent(value('id')) : null;
  const id = existing ? existing.id : uniqueEventId(value('date'), value('title'));

  let image = value('image');
  const file = f.imageFile.files[0];
  if (file) {
    const path = `assets/uploads/events/${id}-${Date.now().toString(36)}.jpg`;
    admin.pendingImages.set(path, await compressImage(file, 1600, 0.82));
    image = path;
  }

  const evt = { id };
  for (const name of ['title', 'date', 'category', 'startTime', 'endTime', 'location', 'speaker', 'registrationUrl', 'summary', 'description']) {
    if (value(name)) evt[name] = value(name);
  }
  if (image) evt.image = image;

  const events = state.data.events || (state.data.events = []);
  const index = events.findIndex(e => e.id === id);
  if (index >= 0) events[index] = evt;
  else events.push(evt);
  events.sort((a, b) => a.date.localeCompare(b.date));

  setDirty(true);
  renderAll();
  toast(`Saved “${evt.title}”. Click “Publish changes” to put it on the live site.`);
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

    for (const [path, content] of admin.pendingImages) {
      const stillUsed = (state.data.events || []).some(e => e.image === path);
      if (stillUsed) {
        await gh(`/repos/${ADMIN_REPO}/contents/${path}`, {
          method: 'PUT',
          body: JSON.stringify({ message: `Upload ${path}`, content, branch: ADMIN_BRANCH })
        });
      }
      admin.pendingImages.delete(path);
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
