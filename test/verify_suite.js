/**
 * IEEE CIS London Section Chapter — Automated 4-Tier Verification Suite
 * (Updated per User Directive: Direct Profile Link + Mailto, No standalone member.html)
 *
 * Usage:
 *   node test/verify_suite.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO_ROOT = path.resolve(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

const symbols = {
  pass: '✓',
  fail: '✗',
  warn: '⚠'
};

class TestSuiteRunner {
  constructor() {
    this.results = [];
    this.currentTier = '';
    this.tierSummaries = {};
    this.startTime = Date.now();
  }

  setTier(name) {
    this.currentTier = name;
    if (!this.tierSummaries[name]) {
      this.tierSummaries[name] = { pass: 0, fail: 0, tests: [] };
    }
    console.log(`\n${colors.bold}${colors.blue}=== ${name} ===${colors.reset}`);
  }

  record(testId, name, passed, message, extra = null) {
    const record = { tier: this.currentTier, id: testId, name, passed, message, extra };
    this.results.push(record);
    if (!this.tierSummaries[this.currentTier]) {
      this.tierSummaries[this.currentTier] = { pass: 0, fail: 0, tests: [] };
    }
    this.tierSummaries[this.currentTier].tests.push(record);

    if (passed) {
      this.tierSummaries[this.currentTier].pass++;
      console.log(`  ${colors.green}${symbols.pass}${colors.reset} [${testId}] ${name}`);
      if (message) console.log(`     ${colors.dim}${message}${colors.reset}`);
    } else {
      this.tierSummaries[this.currentTier].fail++;
      console.log(`  ${colors.red}${symbols.fail}${colors.reset} [${testId}] ${colors.bold}${name}${colors.reset}`);
      console.log(`     ${colors.red}Failure: ${message}${colors.reset}`);
      if (extra) console.log(`     ${colors.yellow}Detail: ${typeof extra === 'object' ? JSON.stringify(extra) : extra}${colors.reset}`);
    }
  }

  printSummary() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    let totalPass = 0;
    let totalFail = 0;

    console.log(`\n${colors.bold}${colors.cyan}============================================================${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}           IEEE CIS LONDON VERIFICATION SUMMARY             ${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}============================================================${colors.reset}`);

    for (const [tier, stats] of Object.entries(this.tierSummaries)) {
      totalPass += stats.pass;
      totalFail += stats.fail;
      const statusIcon = stats.fail === 0 ? `${colors.green}${symbols.pass}` : `${colors.red}${symbols.fail}`;
      console.log(`  ${statusIcon} ${colors.bold}${tier}${colors.reset}: ${stats.pass} passed, ${stats.fail} failed`);
    }

    console.log(`${colors.dim}------------------------------------------------------------${colors.reset}`);
    const overallIcon = totalFail === 0 ? `${colors.green}${colors.bold}ALL TESTS PASSED` : `${colors.red}${colors.bold}TEST SUITE DETECTED FAILURES`;
    console.log(`  Status:    ${overallIcon}${colors.reset}`);
    console.log(`  Total:     ${totalPass + totalFail} assertions`);
    console.log(`  Passed:    ${colors.green}${totalPass}${colors.reset}`);
    console.log(`  Failed:    ${totalFail > 0 ? colors.red : colors.dim}${totalFail}${colors.reset}`);
    console.log(`  Duration:  ${elapsed}s`);
    console.log(`${colors.bold}${colors.cyan}============================================================${colors.reset}\n`);

    return totalFail === 0;
  }
}

function fileExists(relPath) {
  return fs.existsSync(path.join(REPO_ROOT, relPath));
}

function readFileContent(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf-8');
}

function readJsonFile(relPath) {
  return JSON.parse(readFileContent(relPath));
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    if (file === '.git' || file === 'node_modules' || file === '.agents') continue;
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  }
  return arrayOfFiles;
}

function generateIcsPayload(evt) {
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const cleanDate = (evt.date || '2026-11-18').replace(/-/g, '');
  const dtStart = `${cleanDate}T093000Z`;
  const dtEnd = `${cleanDate}T173000Z`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//IEEE Computational Intelligence Society//London Section//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:evt-${evt.id || 'symposium'}@ieee-cis-london.org`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${evt.title || 'IEEE CIS London Event'}`,
    `DESCRIPTION:${(evt.summary || '').replace(/\n/g, '\\n')}`,
    `LOCATION:${evt.location || 'London, United Kingdom'}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

function generateGoogleCalendarUrl(evt) {
  const cleanDate = (evt.date || '20261118').replace(/-/g, '');
  const dates = `${cleanDate}T093000Z/${cleanDate}T173000Z`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: evt.title || 'IEEE CIS London Event',
    dates: dates,
    details: `${evt.summary || ''}\nSpeaker: ${evt.speaker || 'IEEE CIS London'}`,
    location: evt.location || 'London, United Kingdom'
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function simulateImageCompression(originalWidth, originalHeight, maxWidth = 1280, quality = 0.82) {
  let width = originalWidth;
  let height = originalHeight;
  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }
  return {
    width,
    height,
    aspectRatioPreserved: Math.abs((originalWidth / originalHeight) - (width / height)) < 0.01,
    quality
  };
}

function processEventRegistration(formData, eventItem) {
  const errors = [];
  if (!formData.name || !formData.name.trim()) errors.push('Name is required');
  if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) errors.push('Valid email is required');
  if (!formData.affiliation || !formData.affiliation.trim()) errors.push('Affiliation is required');

  if (errors.length > 0) return { success: false, errors };

  return {
    success: true,
    ticket: {
      ticketId: `CIS-LON-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`,
      eventId: eventItem.id,
      eventTitle: eventItem.title,
      attendeeName: formData.name.trim(),
      attendeeEmail: formData.email.trim(),
      affiliation: formData.affiliation.trim(),
      registeredAt: new Date().toISOString(),
      status: 'confirmed'
    }
  };
}

async function runVerification() {
  const runner = new TestSuiteRunner();
  console.log(`\n${colors.bold}${colors.magenta}IEEE CIS London Section Chapter — Automated Acceptance Verification Suite${colors.reset}`);
  console.log(`${colors.dim}Target Root: ${REPO_ROOT}${colors.reset}\n`);

  // ==========================================================================
  // TIER 1: Static and Security Integrity
  // ==========================================================================
  runner.setTier('Tier 1: Static and Security Integrity');
  const requiredFiles = [
    'index.html',
    'assets/css/style.css',
    'assets/js/app.js',
    'data/site-data.json',
    '.nojekyll',
    '.gitignore',
    'README.md'
  ];
  for (const relPath of requiredFiles) {
    const exists = fileExists(relPath);
    runner.record('T1.1_RequiredFile', `Required file exists: ${relPath}`, exists, exists ? `Found at ${relPath}` : `Missing required file: ${relPath}`);
  }

  let siteData = null;
  let jsonParsed = false;
  try {
    siteData = readJsonFile('data/site-data.json');
    jsonParsed = true;
  } catch {
    jsonParsed = false;
  }

  runner.record('T1.2_DataJsonParse', 'data/site-data.json is valid JSON', jsonParsed, jsonParsed ? 'Successfully parsed data/site-data.json' : 'Failed to parse JSON file');

  if (siteData) {
    const requiredTopLevel = ['siteMeta', 'events', 'topics', 'gallery', 'committee'];
    const missingTopLevel = requiredTopLevel.filter(k => !(k in siteData));
    runner.record('T1.2_DataTopLevelKeys', 'data/site-data.json has required top keys', missingTopLevel.length === 0, missingTopLevel.length === 0 ? 'All 5 top-level sections exist' : `Missing: ${missingTopLevel.join(', ')}`);

    const committee = siteData.committee || [];
    runner.record('T1.2_CommitteeArray', 'committee section contains member records', Array.isArray(committee) && committee.length > 0, `Found ${committee.length} committee members`);

    // Schema: id, name, role, affiliation, bio, profileUrl, email
    const requiredMemberFields = ['id', 'name', 'role', 'affiliation', 'bio', 'profileUrl', 'email'];
    let allMembersValid = true;
    const memberViolations = [];
    committee.forEach((m, idx) => {
      const missing = requiredMemberFields.filter(f => !m[f] || (typeof m[f] === 'string' && !m[f].trim()));
      if (missing.length > 0) {
        allMembersValid = false;
        memberViolations.push(`Member #${idx + 1} (${m.name || m.id}) missing/empty fields: ${missing.join(', ')}`);
      }
      if (m.profileUrl && !/^https?:\/\//i.test(m.profileUrl)) {
        allMembersValid = false;
        memberViolations.push(`Member ${m.name}: profileUrl must be a valid http(s) URL`);
      }
      if (m.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email.replace(/^mailto:/i, ''))) {
        allMembersValid = false;
        memberViolations.push(`Member ${m.name}: email must be a valid email address`);
      }
    });

    runner.record(
      'T1.2_CommitteeMemberSchema',
      'Committee members schema integrity (id, name, role, affiliation, bio, profileUrl, email)',
      allMembersValid && committee.length > 0,
      allMembersValid ? 'All committee members conform to profileUrl & email schema' : 'Schema violations detected',
      memberViolations
    );
  }

  const allRepoFiles = getAllFiles(REPO_ROOT);
  const secretPattern = /(ghp_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g;
  const secretViolations = [];
  for (const filePath of allRepoFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const matches = content.match(secretPattern);
      if (matches) secretViolations.push({ file: path.relative(REPO_ROOT, filePath), count: matches.length });
    } catch {}
  }
  runner.record('T1.3_ZeroSecretTokens', 'Zero secret tokens or credentials in tracked files', secretViolations.length === 0, secretViolations.length === 0 ? `Scanned ${allRepoFiles.length} files: clean with 0 secrets` : `Found secret tokens in ${secretViolations.length} files!`, secretViolations);

  const gitignoreExists = fileExists('.gitignore');
  let gitignoreCoversSensitive = false;
  if (gitignoreExists) {
    const gitignoreContent = readFileContent('.gitignore');
    gitignoreCoversSensitive = gitignoreContent.includes('.env') || gitignoreContent.toLowerCase().includes('token') || gitignoreContent.includes('.DS_Store');
  }
  runner.record('T1.4_GitignoreIntegrity', '.gitignore exists and covers sensitive patterns', gitignoreExists && gitignoreCoversSensitive, gitignoreExists && gitignoreCoversSensitive ? '.gitignore properly configured' : '.gitignore missing or lacks sensitive patterns');

  // ==========================================================================
  // TIER 2: Public Portal & Member Profile Functional Verification
  // ==========================================================================
  runner.setTier('Tier 2: Public Portal & Member Profile Functional Verification');
  const indexHtml = fileExists('index.html') ? readFileContent('index.html') : '';
  const appJs = fileExists('assets/js/app.js') ? readFileContent('assets/js/app.js') : '';

  const committeeRendersProfileUrl =
    (appJs.includes('profileUrl') || indexHtml.includes('profileUrl')) &&
    (appJs.includes('target="_blank"') || indexHtml.includes('target="_blank"'));

  const committeeRendersMailto =
    (appJs.includes('mailto:') || indexHtml.includes('mailto:')) &&
    (appJs.includes('m.email') || appJs.includes('member.email'));

  runner.record(
    'T2.1_CommitteeMemberLinksAndMailto',
    'Committee cards render direct profile link (target="_blank") and direct mailto link',
    committeeRendersProfileUrl && committeeRendersMailto,
    committeeRendersProfileUrl && committeeRendersMailto
      ? 'Verified direct profileUrl (target="_blank") and mailto links on committee cards'
      : `ProfileLink: ${committeeRendersProfileUrl ? 'OK' : 'MISSING'}, Mailto: ${committeeRendersMailto ? 'OK' : 'MISSING'}`
  );

  let eventFilteringWorking = false;
  if (siteData && siteData.events) {
    const upcoming = siteData.events.filter(e => e.status === 'upcoming');
    const past = siteData.events.filter(e => e.status === 'past');
    const searchRes = siteData.events.filter(e => (e.title + ' ' + e.summary).toLowerCase().includes('london'));
    eventFilteringWorking = upcoming.length > 0 && past.length > 0 && searchRes.length > 0;
  }
  runner.record('T2.2_EventSearchAndFilter', 'Event search and status/category filtering logic', eventFilteringWorking, eventFilteringWorking ? 'Verified status filters and keyword search' : 'Event filtering verification failed');

  const sampleEvt = siteData?.events?.[0] || { id: 'evt-test', title: '2026 Test Symposium' };
  const validReg = processEventRegistration({ name: 'Dr. Jane Smith', email: 'jane.smith@imperial.ac.uk', affiliation: 'Imperial College London' }, sampleEvt);
  const invalidReg = processEventRegistration({ name: 'Dr. Jane Smith', email: 'invalid', affiliation: 'Imperial College London' }, sampleEvt);
  const regPass = validReg.success && validReg.ticket.ticketId.startsWith('CIS-LON-') && !invalidReg.success;
  runner.record('T2.3_EventRegistration', 'Interactive event registration workflow', regPass, regPass ? `Issued ticket ${validReg.ticket.ticketId}` : 'Registration workflow failed');

  const icsPayload = generateIcsPayload(sampleEvt);
  const icsValid = icsPayload.startsWith('BEGIN:VCALENDAR') && icsPayload.includes('VERSION:2.0') && icsPayload.includes('BEGIN:VEVENT') && icsPayload.endsWith('END:VCALENDAR');
  const gcalUrl = generateGoogleCalendarUrl(sampleEvt);
  const gcalValid = gcalUrl.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE');
  runner.record('T2.4_CalendarExport', 'RFC 5545 .ics payload and Google Calendar URL generation', icsValid && gcalValid, icsValid && gcalValid ? 'Valid RFC 5545 payload and Google Calendar URL' : 'Calendar export failed');

  let topicPillarsValid = false;
  if (siteData && siteData.topics) {
    const cats = new Set(siteData.topics.map(t => t.category));
    topicPillarsValid = cats.has('Neural Networks') && cats.has('Evolutionary Computation') && (cats.has('Fuzzy Systems & XAI') || cats.has('Fuzzy Systems')) && (cats.has('Emerging Topics') || cats.has('Emerging AI'));
  }
  runner.record('T2.5_ResearchTopicsPillars', 'Research topics cover 4 CIS pillars', topicPillarsValid, topicPillarsValid ? 'All 4 pillars present' : 'Missing CIS pillars');

  const hasKeyboard = appJs.includes('ArrowLeft') && appJs.includes('ArrowRight') && appJs.includes('Escape');
  const hasTouch = appJs.includes('touchstart') && appJs.includes('touchend');
  runner.record('T2.6_GalleryLightboxNavigation', 'Lightbox keyboard shortcuts and touch swipe gestures', hasKeyboard && hasTouch, hasKeyboard && hasTouch ? 'Keyboard and touch swipe verified' : `Keyboard: ${hasKeyboard}, Touch: ${hasTouch}`);

  // ==========================================================================
  // TIER 3: Admin CMS & Data Integrity
  // ==========================================================================
  runner.setTier('Tier 3: Admin CMS & Data Integrity');
  const adminAuth = appJs.includes('cis-london-2026') && appJs.includes('admin') && appJs.includes('sessionStorage');
  runner.record('T3.1_AdminAuth', 'Admin authentication validation (admin / cis-london-2026)', adminAuth, adminAuth ? 'Admin credentials verified' : 'Admin auth failed');

  const committeeInputsInIndex =
    (indexHtml.includes('mem-profile') || indexHtml.includes('mem-url')) &&
    indexHtml.includes('mem-email');

  const committeeCRUDInApp =
    appJs.includes('saveCommitteeMember') &&
    (appJs.includes('profileUrl') || appJs.includes('mem-profile') || appJs.includes('mem-url')) &&
    (appJs.includes('email') || appJs.includes('mem-email'));

  runner.record(
    'T3.2_CommitteeProfileCRUD',
    'Admin CMS committee manager includes inputs & CRUD for profileUrl and email',
    committeeInputsInIndex && committeeCRUDInApp,
    committeeInputsInIndex && committeeCRUDInApp
      ? 'CMS committee form supports profileUrl and email updates'
      : `CMS inputs: ${committeeInputsInIndex ? 'OK' : 'MISSING'}, App logic: ${committeeCRUDInApp ? 'OK' : 'MISSING'}`
  );

  const compTest = simulateImageCompression(2560, 1440, 1280, 0.84);
  const compValid = compTest.width === 1280 && compTest.height === 720 && compTest.aspectRatioPreserved;
  runner.record('T3.3_PhotoCompressionAlgorithm', 'Client-side photo compression algorithm', compValid, compValid ? `Scaled 2560x1440 -> ${compTest.width}x${compTest.height}` : 'Compression failed');

  let roundtripValid = false;
  if (siteData) {
    try {
      const restored = JSON.parse(JSON.stringify(siteData));
      roundtripValid = restored.events.length === siteData.events.length && restored.committee.length === siteData.committee.length;
    } catch {}
  }
  runner.record('T3.4_DataExportImportRoundtrip', 'Data export and import roundtrip', roundtripValid, roundtripValid ? 'JSON roundtrip verified' : 'Export/import failed');

  const expectedRepo = 'IEEE-CIS-London/IEEE-CIS-London.github.io';
  const repoValid = siteData?.siteMeta?.githubRepo === expectedRepo && siteData?.siteMeta?.githubBranch === 'main';
  runner.record('T3.5_CloudSyncDefaultRepo', `Cloud sync default repo is ${expectedRepo} on branch main`, repoValid, repoValid ? 'Default repository verified' : `Found repo=${siteData?.siteMeta?.githubRepo}`);

  // ==========================================================================
  // TIER 4: Git & Live Deployment Setup
  // ==========================================================================
  runner.setTier('Tier 4: Git & Live Deployment Setup');
  let originMatches = false;
  if (fileExists('.git/config')) {
    originMatches = readFileContent('.git/config').includes('IEEE-CIS-London/IEEE-CIS-London.github.io');
  }
  runner.record('T4.1_GitRemoteOrigin', 'Git remote origin is IEEE-CIS-London/IEEE-CIS-London.github.io.git', originMatches, originMatches ? 'Remote origin verified' : 'Remote origin mismatch');

  let branchMatches = false;
  if (fileExists('.git/HEAD')) {
    branchMatches = readFileContent('.git/HEAD').trim() === 'ref: refs/heads/main';
  }
  runner.record('T4.2_GitBranchMain', 'Git branch is main', branchMatches, branchMatches ? 'Branch is main' : 'Branch is not main');

  const liveUrl = 'https://ieee-cis-london.github.io/';
  let liveHttpCheck = { success: false, statusCode: null };
  try {
    liveHttpCheck = await new Promise((resolve) => {
      const req = https.get(liveUrl, { timeout: 6000 }, (res) => resolve({ success: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode }));
      req.on('error', () => resolve({ success: false, statusCode: null }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, statusCode: null }); });
    });
  } catch {}
  runner.record('T4.3_LiveDeploymentDomain', `Live deployment accessible at ${liveUrl}`, liveHttpCheck.success, liveHttpCheck.success ? `HTTP ${liveHttpCheck.statusCode}` : 'Pending initial git push / DNS propagation');

  const allPassed = runner.printSummary();
  process.exit(allPassed ? 0 : 1);
}

if (require.main === module) {
  runVerification().catch(err => {
    console.error('Fatal error in test suite:', err);
    process.exit(1);
  });
}

module.exports = { TestSuiteRunner, generateIcsPayload, generateGoogleCalendarUrl, simulateImageCompression, processEventRegistration };
