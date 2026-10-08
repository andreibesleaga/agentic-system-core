'use strict';
// src/application/cli/verbs/init.js — `init` (AGSC-09-07): adoption of a folder
// of bare Markdown into a conforming Bundle (AGSC-02-90…95, AGSC-01-37).
// Adoption is TOTAL — it never errors, every finding is a warning (AGSC-02-92)
// — and it never overwrites a file that exists (AGSC-02-94).
// The rules are `distribution/init.js`'s and `knowledge/adopt.js`'s; this
// module walks the port, plans, and applies.

const path = require('node:path');
const init = require('../../../distribution/init.js');
const helpers = require('./_helpers.js');

const SECURITY_TXT = '.well-known/security.txt';
/** AGSC-06-18: the Content Use Terms file, and the identifier a configuration names it by. */
const LICENSE_CONTENT = 'LICENSE-CONTENT';
const CONTENT_USE_TERMS = 'LicenseRef-AgenticSystemCore-Content-Use-1.0';

/** Everything under the adoption root, as `plan()` wants it. */
function filesUnder(fs) {
  const out = [];
  for (const file of fs.walk('')) {
    if (file.startsWith('.git/') || file.startsWith('node_modules/')) continue;
    if (!file.endsWith('.md')) {
      out.push({ path: file, markdown: null });
      continue;
    }
    try {
      out.push({ path: file, markdown: String(fs.readFile(file, 'utf8')) });
    } catch (e) {
      out.push({ path: file, binary: true, markdown: null });
    }
  }
  return out;
}

/**
 * AGSC-02-90: the operator of an adopted item is resolved from the git identity
 * when one is reachable. It is a process fact, so it arrives through the
 * ProcessRunner port and is `null` when no runner is wired.
 */
function gitUserEmail(ctx) {
  const proc = ctx.ports && ctx.ports.proc;
  if (!proc || typeof proc.run !== 'function') return null;
  let result;
  try {
    result = proc.run('git', ['config', '--get', 'user.email']);
  } catch (e) {
    return null;
  }
  if (!result || result.code !== 0 || typeof result.stdout !== 'string') return null;
  const value = result.stdout.trim();
  return value === '' ? null : value;
}

/** True when the Clock port reports that the build instant fell to 0 (AGSC-E606). */
function instantDefaulted(ctx) {
  const clock = ctx.ports && ctx.ports.clock;
  if (!clock || typeof clock.findings !== 'function') return !clock;
  return clock.findings().some((f) => f && f.code === 'AGSC-E606');
}

/**
 * The steps a build still needs after adoption, said once, on stderr, so that
 * the newcomer's very next `lint`, `build` or `ci` is not the first to say them
 * (AGSC-02-92 and AGSC-02-95 as amended: a security contact is the publisher's,
 * and a node that adopts the Content Use Terms names its crawler list).
 */
function beforeYouBuild(ctx, { fs, defaulted, licenseProse, wroteConfig }) {
  const lines = [];
  if (!fs.exists(SECURITY_TXT)) {
    lines.push(`before you build: add ${SECURITY_TXT} with a Contact: line (RFC 9116); `
      + 'lint, build and ci report AGSC-E901 until it exists (AGSC-06-36)');
  }
  if (wroteConfig) {
    lines.push('before you build: agsc.config.json names the reference crawler list in site.tdm_crawlers, '
      + 'because the default prose licence adopts the Content Use Terms; edit the list, '
      + 'or name another prose licence to publish no reservation (AGSC-06-18)');
  }
  // The Content Use Terms are named, but their text is not in
  // the Bundle, so `export --markdown/--okf` refuses with AGSC-E901 and `/legal/` is
  // not published until the publisher copies the file in or names another licence.
  // The build does not need the file, so this is a step before publishing, and the
  // two "before you build" steps of AGSC-02-92 stay two.
  if (licenseProse === CONTENT_USE_TERMS && !fs.exists(LICENSE_CONTENT)) {
    lines.push(`before you publish: copy ${LICENSE_CONTENT} from the agentic-system-core package into this folder `
      + '(it is the text of the Content Use Terms agsc.config.json names), or name another prose licence; '
      + 'without it export --markdown and --okf report AGSC-E901 and /legal/ is not published (AGSC-06-18)');
  }
  if (defaulted) {
    lines.push('before you build: commit once, or set SOURCE_DATE_EPOCH, so the build has an instant '
      + '(AGSC-04-09); the security contact\'s expiry is checked against it');
  }
  for (const line of lines) helpers.note(ctx, line);
}

function run(ctx) {
  const fs = ctx.ports.fs;
  const defaulted = instantDefaulted(ctx);
  const planned = init.plan(filesUnder(fs), {
    config: ctx.config,
    directory: path.basename(path.resolve(ctx.root)),
    epoch: ctx.ports.clock ? ctx.ports.clock.now() : 0,
    gitUserEmail: gitUserEmail(ctx),
    instantDefaulted: defaulted,
    specVersion: ctx.specVersion,
    tdmCrawlers: init.REFERENCE_TDM_CRAWLERS,
  });
  const applied = init.run({ fs }, planned);
  for (const written of applied.written) helpers.note(ctx, `wrote: ${written}`);
  // A note with a closed frontmatter block is left out of the adoption: AGSC-02-91
  // keeps it as it is, and this line says so instead of leaving it out silently.
  for (const kept of planned.kept || []) {
    helpers.note(ctx, `left as is: ${kept} already has a frontmatter block, so init neither changes nor moves it `
      + '(AGSC-02-91); it is not an item until it has a type and lives under content/<type-plural>/ (AGSC-01-02)');
  }
  const config = planned.config !== null ? planned.config : (ctx.config || {});
  const licenseProse = (config.bundle || {}).license_prose === undefined
    ? CONTENT_USE_TERMS : config.bundle.license_prose;
  beforeYouBuild(ctx, { fs, defaulted, licenseProse, wroteConfig: planned.config !== null });
  return { findings: applied.findings };
}

module.exports = { name: 'init', filesUnder, gitUserEmail, instantDefaulted, run };
