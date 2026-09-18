'use strict';
// src/application/cli/verbs/init.js — `init` (AGSC-09-07): adoption of a folder
// of bare Markdown into a conforming Bundle (AGSC-02-90…95, AGSC-01-37).
// Adoption is TOTAL — it never errors, every finding is a warning (AGSC-02-92)
// — and it never overwrites a file that exists (AGSC-02-94).
// The rules are `distribution/init.js`'s and `knowledge/adopt.js`'s; this
// module walks the port, plans, and applies. Owner: B (shell); wired at
// integration (WP-10-G).

const path = require('node:path');
const init = require('../../../distribution/init.js');
const helpers = require('./_helpers.js');

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

function run(ctx) {
  const fs = ctx.ports.fs;
  const planned = init.plan(filesUnder(fs), {
    config: ctx.config,
    directory: path.basename(path.resolve(ctx.root)),
    epoch: ctx.ports.clock ? ctx.ports.clock.now() : 0,
    gitUserEmail: gitUserEmail(ctx),
    specVersion: ctx.specVersion,
  });
  const applied = init.run({ fs }, planned);
  for (const written of applied.written) helpers.note(ctx, `wrote: ${written}`);
  return { findings: applied.findings };
}

module.exports = { name: 'init', filesUnder, gitUserEmail, run };
