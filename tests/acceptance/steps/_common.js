'use strict';
// The shared step phrases: the ones more than one persona needs — a fresh copy of
// the acceptance Bundle, a scratch git history on fixed dates, a commit with given
// trailers, a tracked `.env`, the environment of the next command, any `agsc`
// command (build, lint, `ci --json`, …) with or without the network trap, the exit
// code and the AGSC-09-11 envelope it printed, the node served on loopback, and
// the shipped `validate-wellknown` over loopback. A persona file reuses these
// phrases instead of writing its own; the runner refuses a phrase with two
// definitions, and `tests/acceptance/common-steps.test.js` exercises every
// definition here before any scenario uses it.
//
// Phrases (Given, When and Then are interchangeable in Gherkin):
//   a fresh copy of the acceptance Bundle
//   the Bundle is a git repository of one commit with fixed dates
//   a commit "<subject>" carrying the trailer "<Key: value>"
//   a commit "<subject>" carrying these trailers:      (data table: | Key | value |)
//   the last commit carries the trailer "<Key: value>"
//   a ".env" file is tracked in the Bundle's git history
//   the environment variable "<NAME>" is "<value>" | is unset
//   the Bundle is built
//   the Bundle is built and served on loopback
//   the <role> runs "agsc <arguments>"[ under the network trap]
//       <role>: author, agent, contributor, maintainer, newcomer, operator,
//       publisher, researcher, reviewer or team; the arguments are split on
//       spaces and carry no quotes
//   the command exits <n>
//   the JSON envelope's status is "pass" | "fail"
//   the JSON envelope carries the error | the warning "AGSC-E<nnn>"
//   the JSON envelope carries no "AGSC-E<nnn>"
//   the output names "<text>"
//   no network call was attempted
//   the Bundle holds | does not hold "<path>"
//   the shipped validate-wellknown passes | fails at Level <n> over loopback
//
// Not a persona file: its name starts with `_`, and the runner loads it by name.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { EPOCH, built } = require('./_world.js');

const ROLES = 'author|agent|contributor|maintainer|newcomer|operator|publisher|researcher|reviewer|team';

/** The findings of the last envelope with one code (and, when given, one severity). */
function findingsOf(world, code, severity) {
  const envelope = world.json();
  assert.ok(Array.isArray(envelope.findings), `the output carries no findings array: ${world.last.stdout}`);
  return envelope.findings.filter((f) => f.code === code && (!severity || f.severity === severity));
}

/** Make the current Bundle's site base the loopback origin it is served on, then build it. */
async function buildAndServe(world) {
  if (!fs.existsSync(path.join(world.dir, '.git'))) world.commitAll('Initial content');
  const { origin, port } = await world.serve('www');
  // The configuration schema admits a plain-HTTP base only for `localhost`; the
  // server listens on the address `localhost` resolves to first (`_world.js`
  // serve), which is the one the shipped checker connects to.
  const config = JSON.parse(world.read('agsc.config.json'));
  config.site.base = `http://localhost:${port}/`;
  world.write('agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);
  built(world);
  world.state.loopback = { base: config.site.base, origin };
}

module.exports = [
  {
    pattern: 'a fresh copy of the acceptance Bundle',
    run(world) {
      world.bundle();
    },
  },
  {
    pattern: 'the Bundle is a git repository of one commit with fixed dates',
    run(world) {
      world.commitAll('Initial content');
      // Git's raw date (seconds since the epoch and the zone) reads the same in
      // every git version; the strict ISO spelling does not (`+00:00` or `Z`).
      assert.strictEqual(world.git(['log', '-1', '--date=raw', '--format=%ad %cd']).trim(),
        `${EPOCH} +0000 ${EPOCH} +0000`);
    },
  },
  {
    pattern: /^a commit "([^"]+)" carrying the trailer "([^"]+)"$/u,
    run(world, subject, trailer) {
      world.commit(subject, [trailer]);
    },
  },
  {
    pattern: /^a commit "([^"]+)" carrying these trailers:$/u,
    run(world, subject, table) {
      assert.ok(table && table.rows, 'the step needs a data table of | Key | value | rows');
      world.commit(subject, table.rows.map((row) => `${row.cells[0].value}: ${row.cells[1].value}`));
    },
  },
  {
    pattern: /^the last commit carries the trailer "([^"]+)"$/u,
    run(world, trailer) {
      assert.ok(world.trailers().includes(trailer), `the last commit's trailers are ${JSON.stringify(world.trailers())}`);
    },
  },
  {
    pattern: 'a ".env" file is tracked in the Bundle\'s git history',
    run(world) {
      // AGSC-01-37: a tracked .env is refused whatever it holds, so it holds no key.
      world.write('.env', '# a scratch environment file\n');
      world.commit('Track the environment file');
      assert.ok(world.git(['ls-files']).split('\n').includes('.env'));
    },
  },
  {
    pattern: /^the environment variable "([A-Z][A-Z0-9_]*)" is "([^"]*)"$/u,
    run(world, name, value) {
      world.overrides.env[name] = value;
      world.overrides.unset = world.overrides.unset.filter((n) => n !== name);
    },
  },
  {
    pattern: /^the environment variable "([A-Z][A-Z0-9_]*)" is unset$/u,
    run(world, name) {
      delete world.overrides.env[name];
      if (!world.overrides.unset.includes(name)) world.overrides.unset.push(name);
    },
  },
  {
    pattern: 'the Bundle is built',
    run(world) {
      built(world);
    },
  },
  {
    pattern: 'the Bundle is built and served on loopback',
    run(world) {
      return buildAndServe(world);
    },
  },
  {
    pattern: new RegExp(`^the (?:${ROLES}) runs "agsc ([^"]*)"( under the network trap)?$`, 'u'),
    run(world, args, trap) {
      world.agsc(args.split(' ').filter(Boolean), { offline: Boolean(trap) });
    },
  },
  {
    pattern: /^the command exits (\d)$/u,
    run(world, code) {
      assert.strictEqual(world.last.exit, Number(code), `${world.last.stdout}${world.last.stderr}`);
    },
  },
  {
    pattern: /^the JSON envelope's status is "(pass|fail)"$/u,
    run(world, status) {
      assert.strictEqual(world.json().status, status, world.last.stdout);
    },
  },
  {
    pattern: /^the JSON envelope carries the (error|warning) "(AGSC-E\d{3})"$/u,
    run(world, kind, code) {
      assert.ok(findingsOf(world, code, kind === 'error' ? 'error' : 'warn').length > 0,
        `no ${kind} ${code} in ${world.last.stdout}`);
    },
  },
  {
    pattern: /^the JSON envelope carries no "(AGSC-E\d{3})"$/u,
    run(world, code) {
      assert.deepStrictEqual(findingsOf(world, code), []);
    },
  },
  {
    pattern: /^the output names "([^"]+)"$/u,
    run(world, text) {
      assert.ok(`${world.last.stdout}${world.last.stderr}`.includes(text), `"${text}" is not in ${world.last.stdout}${world.last.stderr}`);
    },
  },
  {
    pattern: 'no network call was attempted',
    run(world) {
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: /^the Bundle (holds|does not hold) "([^"]+)"$/u,
    run(world, which, rel) {
      assert.strictEqual(world.exists(rel), which === 'holds', `${rel} ${which === 'holds' ? 'is missing' : 'exists'}`);
    },
  },
  {
    pattern: /^the shipped validate-wellknown (passes|fails) at Level ([0-3]) over loopback$/u,
    run(world, outcome, level) {
      assert.ok(world.state.loopback, 'no node is served on loopback in this scenario');
      const r = world.tool('validate-wellknown',
        [`${world.state.loopback.base}.well-known/knowledge-linkset`, '--level', level, '--dev', '--json']);
      assert.strictEqual(r.exit, outcome === 'passes' ? 0 : 1, `${r.stdout}${r.stderr}`);
    },
  },
];
