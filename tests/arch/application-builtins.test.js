'use strict';
// The application layer wires the contexts to the host, so it is the one part of
// `src/` that may load Node built-ins besides `crypto` (and the Boundary's `net` and
// `url`). Which ones is a short, closed list, held here so that a new built-in in
// this layer is a decision, not an accident:
//
//   path, crypto, util   anywhere in src/application/;
//   fs                   only in src/application/hosting.js, the deployment-profile
//                        writer and local server of `agsc-host`, which today reaches
//                        the file system directly instead of through the FileSystem
//                        port (moving it behind the port is planned for 1.1);
//   os                   only in src/application/cli/verbs/run.js (the temporary
//                        directory a run block executes in).
//
// Everything else that touches the host — a socket, a process, the clock — is an
// adapter under src/adapters/, which this layer constructs and hands on. The test
// reads the files (tests/arch/_code.js); it never runs a module.

const test = require('node:test');
const assert = require('node:assert');
const { builtinOf, requiresOf } = require('./_code.js');
const { sources } = require('./_scan.js');

const ANYWHERE = Object.freeze(['path', 'crypto', 'util']);
const ONLY_IN = Object.freeze({
  fs: 'src/application/hosting.js',
  os: 'src/application/cli/verbs/run.js',
});

/** Every built-in one module of the application layer loads that the list does not allow it. */
function builtinFaults(text, rel) {
  const faults = [];
  for (const specifier of requiresOf(text, rel)) {
    const builtin = builtinOf(specifier);
    if (builtin === null || ANYWHERE.includes(builtin) || ONLY_IN[builtin] === rel) continue;
    const where = ONLY_IN[builtin] ? `only ${ONLY_IN[builtin]} may` : 'no module of the application layer may';
    faults.push(`${rel} loads the built-in "${specifier}"; ${where}`);
  }
  return faults;
}

function applicationSources() {
  const found = sources().filter((file) => file.dir === 'application' || file.dir.startsWith('application/'));
  assert.ok(found.length >= 10, `the scan found ${found.length} modules in src/application/`);
  return found;
}

test('the application layer loads only path, crypto and util, with fs and os each in one module', () => {
  const faults = applicationSources().flatMap((file) => builtinFaults(file.text, file.rel));
  assert.deepStrictEqual(faults, []);
});

test('each one-module exception is still used, so the list cannot outlive the code', () => {
  const byRel = new Map(applicationSources().map((file) => [file.rel, file]));
  for (const [builtin, rel] of Object.entries(ONLY_IN)) {
    const file = byRel.get(rel);
    assert.ok(file, `${rel} is gone; remove "${builtin}" from the list here and from docs/ENGINEERING.md §3`);
    assert.ok(requiresOf(file.text, file.rel).some((s) => builtinOf(s) === builtin),
      `${rel} no longer loads "${builtin}"; remove it from the list here and from docs/ENGINEERING.md §3`);
  }
});

test('a module that loads another built-in, or an allowed one in the wrong module, is refused', () => {
  const probes = [
    ['src/application/probe.js', "const net = require('node:net');", 'node:net'],
    ['src/application/probe.js', 'const cp = require("child_process");', 'child_process'],
    ['src/application/probe.js', "const load = () => import('node:http');", 'node:http'],
    ['src/application/cli/verbs/lint.js', "const fs = require('node:fs'); // a trailing comment", 'node:fs'],
    ['src/application/hosting.js', "const os = require('node:os');", 'node:os'],
    ['src/application/cli/verbs/run.js', "const fs = require('node:fs/promises');", 'node:fs/promises'],
  ];
  for (const [rel, text, specifier] of probes) {
    const faults = builtinFaults(text, rel);
    assert.ok(faults.some((f) => f.includes(`"${specifier}"`)), `${rel}: ${text} → ${JSON.stringify(faults)}`);
  }
  // Allowed: the shared three anywhere, the exceptions in their module, a package, a
  // relative module, and a built-in named only in a comment.
  const allowed = [
    ['src/application/probe.js', "const path = require('node:path'); const { createHash } = require('node:crypto');"],
    ['src/application/probe.js', "const { parseArgs } = require('node:util'); const diff = require('diff');"],
    ['src/application/hosting.js', "const fs = require('node:fs');"],
    ['src/application/cli/verbs/run.js', "const os = require('node:os');"],
    ['src/application/probe.js', "const helpers = require('./_helpers.js'); // not require('node:net')"],
  ];
  for (const [rel, text] of allowed) assert.deepStrictEqual(builtinFaults(text, rel), [], `${rel}: ${text}`);
});
