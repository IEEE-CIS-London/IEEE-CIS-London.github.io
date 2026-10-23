#!/usr/bin/env node
/**
 * Manage admin accounts for the website's admin page.
 *
 *   node add-admin.mjs            add an admin or change a password
 *   node add-admin.mjs --remove   remove an admin
 *   node add-admin.mjs --list     list admins
 *
 * Password hashes are kept locally in .admin-users.json (git-ignored) and uploaded to the
 * Worker's ADMIN_USERS secret. Run this in your own terminal: passwords are typed hidden.
 */
import { webcrypto as crypto } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const ITERATIONS = 10000; // hashes stay secret inside Cloudflare; this keeps sign-in within Worker CPU limits
const FILE = fileURLToPath(new URL('.admin-users.json', import.meta.url));
const users = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};

function ask(question, hidden = false) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = text => { if (text.includes(question)) process.stdout.write(text); };
    rl.question(question, answer => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function hash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return `pbkdf2$${ITERATIONS}$${Buffer.from(salt).toString('base64')}$${Buffer.from(bits).toString('base64')}`;
}

function upload() {
  writeFileSync(FILE, JSON.stringify(users, null, 2) + '\n', { mode: 0o600 });
  execFileSync('npx', ['wrangler', 'secret', 'put', 'ADMIN_USERS'], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    input: JSON.stringify(users),
    stdio: ['pipe', 'inherit', 'inherit']
  });
}

const mode = process.argv[2];
if (mode === '--list') {
  console.log(Object.keys(users).join('\n') || '(no admins)');
} else if (mode === '--remove') {
  const name = (await ask('Username to remove: ')).toLowerCase();
  if (!users[name]) { console.error(`No admin named "${name}".`); process.exit(1); }
  delete users[name];
  upload();
  console.log(`Removed ${name}. Their sessions stop working immediately.`);
} else {
  const name = (await ask('Username (letters, digits, - or _): ')).toLowerCase();
  if (!/^[a-z0-9_-]{2,32}$/.test(name)) { console.error('Invalid username.'); process.exit(1); }
  const password = await ask('Password (at least 12 characters, hidden): ', true);
  if (password.length < 12) { console.error('Password must be at least 12 characters.'); process.exit(1); }
  if (password !== await ask('Repeat password: ', true)) { console.error('Passwords do not match.'); process.exit(1); }
  const existed = Boolean(users[name]);
  users[name] = await hash(password);
  upload();
  console.log(existed ? `Password for ${name} changed.` : `Admin ${name} added.`);
}
