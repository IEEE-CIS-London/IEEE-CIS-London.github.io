/**
 * Admin sign-in and GitHub publishing proxy for ieee-cis-london.github.io.
 *
 * POST /login            {username, password} -> {session, username}
 * GET|PUT /github/<path> proxied to api.github.com with the repository token,
 *                        only for the website repository and the files admins may change.
 */

const SESSION_HOURS = 8;
const enc = new TextEncoder();

// Paths (after /repos/<REPO>) that admins may read or write
const READABLE = /^(|\/contents\/data\/site-data\.json)$/;
const WRITABLE = /^\/contents\/(data\/site-data\.json|assets\/uploads\/(events|gallery)\/[a-z0-9._-]+\.jpg)$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    try {
      const url = new URL(request.url);
      if (url.pathname === '/login' && request.method === 'POST') return await login(request, env, json);
      if (url.pathname.startsWith('/github/')) return await proxy(request, env, url, json, cors);
      return json({ message: 'Not found' }, 404);
    } catch (err) {
      return json({ message: err.message || 'Server error' }, 500);
    }
  }
};

async function login(request, env, json) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (env.LOGIN_LIMITER) {
    const { success } = await env.LOGIN_LIMITER.limit({ key: ip });
    if (!success) return json({ message: 'Too many sign-in attempts. Please wait a minute and try again.' }, 429);
  }

  const { username = '', password = '' } = await request.json().catch(() => ({}));
  const users = JSON.parse(env.ADMIN_USERS || '{}');
  const name = String(username).trim().toLowerCase();
  const stored = Object.hasOwn(users, name) ? users[name] : null;

  // Always run the hash so response time does not reveal whether the username exists
  const ok = await verifyPassword(String(password), stored || 'pbkdf2$10000$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
  if (!stored || !ok) return json({ message: 'Incorrect username or password.' }, 401);

  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  return json({ session: await signSession({ u: name, exp }, env), username: name, expires: exp });
}

async function proxy(request, env, url, json, cors) {
  const session = await readSession(request.headers.get('Authorization'), env);
  if (!session) return json({ message: 'Your session has expired. Please sign in again.' }, 401);

  const prefix = `/github/repos/${env.REPO}`;
  if (!url.pathname.toLowerCase().startsWith(prefix.toLowerCase())) return json({ message: 'Forbidden' }, 403);
  const rest = url.pathname.slice(prefix.length);
  const allowedPath = request.method === 'GET' ? READABLE.test(rest) || WRITABLE.test(rest)
    : request.method === 'PUT' ? WRITABLE.test(rest) : false;
  if (!allowedPath) return json({ message: 'This change is not allowed from the admin page.' }, 403);

  let body;
  if (request.method === 'PUT') {
    const payload = await request.json();
    payload.message = `${String(payload.message || 'Update site content').slice(0, 200)} [admin: ${session.u}]`;
    body = JSON.stringify(payload);
  }

  const res = await fetch(`https://api.github.com/repos/${env.REPO}${rest}${url.search}`, {
    method: request.method,
    body,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'cis-london-admin-worker',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    }
  });
  return new Response(res.body, { status: res.status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// ---------- Passwords: pbkdf2$iterations$saltB64$hashB64 ----------

async function verifyPassword(password, stored) {
  const [scheme, iterations, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64decode(salt), iterations: Number(iterations) }, key, 256);
  return timingSafeEqual(new Uint8Array(bits), b64decode(hash));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------- Sessions: base64url(payload).base64url(hmac) ----------

async function hmacKey(env) {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is not configured');
  return crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signSession(payload, env) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

async function readSession(header, env) {
  try {
    return await parseSession(header, env);
  } catch {
    return null; // malformed token
  }
}

async function parseSession(header, env) {
  const token = (header || '').replace(/^Bearer\s+/i, '');
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(env), b64urlDecode(sig), enc.encode(body));
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  const users = JSON.parse(env.ADMIN_USERS || '{}');
  // Expired sessions and removed users are rejected
  return payload.exp > Date.now() && Object.hasOwn(users, payload.u) ? payload : null;
}

function b64decode(s) {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  return b64decode(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
}
