// src/application/cli/main.js — AGSC-09-07..12: argv parsing, global flags, exit codes, envelope.
// Argv parsing uses `commander@15.0.0` (ADR-019); exit codes and the
// AGSC-E001/E002/E003 mapping stay ours via exitOverride()+configureOutput().
//
// Node builtins plus the pinned `commander`; no
// network and no live clock read (the
// process environment and SOURCE_DATE_EPOCH are injected via `ctx`, never
// read from `process.env` directly here, so this module stays testable and
// deterministic per AGSC-04-11).
'use strict';

const { Command } = require('commander');
const { load } = require('../config/load.js');
const { checkBoundaryConfig } = require('../../boundary/visibility.js');
const { createClock, isMalformedEpoch } = require('../../adapters/node-clock.js');
const pluginLoader = require('../plugin-loader.js');

const VERBS = [
  'init', 'lint', 'build', 'verify', 'ci', 'export', 'import', 'compose',
  'propose', 'review', 'refresh', 'skills', 'mcp', 'run', 'trace', 'conform',
];

/**
 * The ONE place the engine states which version of the specification it
 * implements (AGSC-09-11's `spec_version` member; AGSC-00-14). Everything else
 * — every envelope, every report, `llms.txt`'s provenance header, the
 * `/compose/` page — takes it from here through `ctx.specVersion`, so a release
 * bump is one edit. A test harness may still pin a per-vector value
 * (`options.spec_version`), which is what keeps a released vector reproducible
 * across an rc bump (AGSC-00-16).
 */
const SPEC_VERSION = '1.0.0-rc.6';

// The five global flags of AGSC-09-09; every verb parser gets these.
const GLOBAL_FLAGS = [
  ['--json', 'bool'],
  ['--quiet', 'bool'],
  ['--plain', 'bool'],
  ['--no-input', 'bool'],
  // --version is handled before a verb is even looked up (see main()).
];

/**
 * AGSC-09-13: `mcp` is a STREAMING verb — its stdout carries JSON-RPC frames
 * and nothing else, so the shell prints no diagnostic line and no envelope
 * there for it. Diagnostics still go to stderr, which
 * AGSC-09-13 explicitly allows.
 */
const STREAMING_VERBS = new Set(['mcp']);

// verb-specific flags beyond the five global ones (AGSC-09-09): name -> 'bool'|'value'.
const VERB_FLAGS = {
  // AGSC-09-09: `lint --fix` applies exactly the normalisations
  // AGSC-04-19 admits — line endings, NFC, trailing newline, frontmatter key order
  // and the wikilink rewriting of AGSC-03-12 — and nothing else (AGSC-04-14/04-20).
  // AGSC-09-09 closes the verb-flag set: "a flag outside this list and outside the
  // verb flags below is `AGSC-E002` with exit 2", and the rule's list names
  // `lint --fix` alone. `agsc lint --self` is therefore the usage error the rule
  // requires — with the hint of `RETIRED_FLAGS` below, so that an operator following
  // `docs/PLAN.md`'s older definition-of-done line is told what replaced it.
  lint: new Map([['--fix', 'bool']]),
  export: new Map([
    ['--markdown', 'bool'], ['--okf', 'bool'], ['--jsonld', 'bool'],
    ['--jsonl', 'bool'], ['--steer', 'bool'], ['--target', 'value'], ['--to', 'value'],
    ['--zip', 'bool'],
  ]),
  // AGSC-01-22/23: `--from` names the foreign format; `--dry-run` reports the plan
  // and writes nothing (AGSC-09-09). The flags of the
  // ADAPTER itself are not here — see ADAPTER_FLAGS.
  import: new Map([['--from', 'value'], ['--dry-run', 'bool']]),
  refresh: new Map([['--agent', 'value'], ['--dry-run', 'bool'], ['--task', 'value']]),
  run: new Map([['--dry-run', 'bool']]),
  conform: new Map([['--level', 'value'], ['--to', 'value']]),
  // AGSC-08-23: `verify --ledger` re-derives the chain and compares its head
  // with the published discovery document.
  verify: new Map([['--ledger', 'bool']]),
  // AGSC-07-24 (`--from`, the saved composition) and AGSC-07-18 (`--emit`).
  // `--out` names the directory the seven Harness files are written to; with no
  // flag the location is AGSC-07-12's own `dist/harness/<name>/`, so a conforming
  // invocation needs no flag. AGSC-09-09's verb-flag list does not yet name it —
  // the proposed wording is on the specification items list.
  // `--zip` writes ONE archive beside a multi-file
  // result — the Harness directory, `dist/skills/`, an export root — so that the
  // `/compose/` page's "download all" link and the command produce the same bytes
  // (AGSC-07-13). Like `compose --out` above it, AGSC-09-09's verb-flag list does
  // not yet name it: the proposed wording is on the specification items list
  // and the archive is never a file OF the Harness, which AGSC-07-12
  // closes at seven kinds — it is written beside the directory and never inside it.
  compose: new Map([['--from', 'value'], ['--emit', 'value'], ['--out', 'value'], ['--zip', 'bool']]),
  skills: new Map([['--zip', 'bool']]),
  build: new Map([['--level', 'value']]),
  ci: new Map([['--level', 'value']]),
};

/**
 * A flag this CLI once registered and AGSC-09-09 does not define. It is a usage
 * error like any other unknown flag; the hint exists so that an operator who read
 * an older document is told what to run instead, rather than being left with
 * "unknown option".
 */
const RETIRED_FLAGS = Object.freeze({
  lint: {
    '--self': 'AGSC-09-09 defines `--fix` and no other flag on `lint`, and `--self` was read by'
      + ' no code. To check this DISTRIBUTION rather than a Bundle, run the nine independent'
      + ' validators of AGSC-09-90: `for t in tools/validate-*; do node $t --json || exit 1; done`,'
      + ' plus `node tools/count-artifacts --json`. To lint a BUNDLE, run `agsc lint` from its root.',
  },
});

/** The hint for a retired flag present in this invocation, or `null`. */
function retiredFlagHint(verb, argv) {
  const table = RETIRED_FLAGS[verb];
  if (table === undefined) return null;
  for (const [flag, hint] of Object.entries(table)) {
    if ((argv || []).includes(flag)) return hint;
  }
  return null;
}

/**
 * AGSC-09-09: "a memory adapter selected by
 * `export --to <adapter>` or `import --from <adapter>` MAY define further flags of
 * its own (AGSC-01-26a): they belong to that adapter's documented contract and not
 * to this specification, they MUST NOT change the meaning of a flag named above, and
 * an engine that does not ship the adapter rejects them with `AGSC-E002`."
 *
 * So they are ADAPTER-SCOPED, not a global allow-list on the verb: `--selection` is
 * legal only while the `old-site` adapter is the one named, and `AGSC-E002` under
 * any other adapter or none. The map is keyed by verb, then by the adapter named in
 * that verb's selector flag.
 *
 *   `--selection <tsv>`   which records are imported and with which `status` — the
 *                         engine carries no list of its own (project rule 9).
 *   `--corrections <json>` the per-card decisions a human made (a re-sourced
 *                         citation, a renamed title, a card held back), as DATA.
 *   `--attach-diagrams`   the other reading of the pull between AGSC-01-07 (a
 *                         compiled `.svg` MUST NOT be committed) and AGSC-02-98
 *                         (an SVG attachment with its source beside it): off by
 *                         default, the operator's choice when asked for.
 *   `--replace`           let the foreign bundle REPLACE an item this node already
 * holds. Without it, any collision with an item on
 *                         disk writes nothing at all and names every collision; with
 *                         it, each replacement is reported. Offered by BOTH adapters,
 *                         because both write into a Bundle that may already hold
 *                         items. It never widens WHERE a write may land: the Bundle's
 *                         own port still refuses an absolute path, a path escaping
 *                         the root and a path that leaves it through a link
 *                         (AGSC-E902).
 */
/**
 * AGSC-09-08's usage class, by code: `AGSC-E004` is "invalid configuration" and
 * `AGSC-E003` a missing or invalid argument, both of which that rule puts in the
 * exit-2 class beside an unknown verb and an unknown flag — including when a verb
 * reports them as a finding (`conform --level 4`, vector cli-0010). Nothing else is
 * added here: a finding about the CONTENT is exit 1, however severe.
 */
const USAGE_CLASS_CODES = new Set(['AGSC-E003', 'AGSC-E004']);

const ADAPTER_FLAGS = {
  import: {
    selector: '--from',
    adapters: {
      'old-site': new Map([['--selection', 'value'], ['--corrections', 'value'],
        ['--attach-diagrams', 'bool'], ['--replace', 'bool']]),
      // `--allow-newer` is the OKF adapter's own flag (AGSC-01-26a, AGSC-09-09:
      // "a memory adapter … MAY define further flags of its own"), for AGSC-01-22's
      // tolerance limit: without it a source declaring a MAJOR this tool does not
      // implement is refused before anything is written (a newer MINOR is imported
      // with the warning AGSC-E506).
      okf: new Map([['--replace', 'bool'], ['--allow-newer', 'bool']]),
      // The COGX adapter offers the same two: `--replace` for AGSC-01-23,
      // `--allow-newer` for an archive of a newer COGX MAJOR or of another spec MAJOR.
      cogx: new Map([['--replace', 'bool'], ['--allow-newer', 'bool']]),
      // The GABBE adapter adds `--source-version <v>`: a kit publishes
      // no content version of its own, and AGSC-01-22 records one on every item.
      gabbe: new Map([['--replace', 'bool'], ['--allow-newer', 'bool'], ['--source-version', 'value']]),
      // The skills adapter adds `--layout <name>` (which foreign layout
      // to read; detected when absent) and `--list` (the catalogue of a local clone:
      // what each layout would import, and nothing is written or fetched), and
      // `--cluster <slug>`, the Cluster every imported skill joins, so it appears in
      // that Cluster's pack (AGSC-07-19) instead of in none.
      skills: new Map([['--replace', 'bool'], ['--allow-newer', 'bool'], ['--source-version', 'value'],
        ['--layout', 'value'], ['--list', 'bool'], ['--cluster', 'value']]),
      // The board adapter adds `--format <tool>`: which tracker's export file
      // the directory holds.
      board: new Map([['--replace', 'bool'], ['--allow-newer', 'bool'], ['--source-version', 'value'],
        ['--format', 'value']]),
    },
  },
  // `export --to skills --layout <name>`: the foreign layout to write.
  // `export --to board --format <tool>`: the tracker's import file to write.
  export: { selector: '--to', adapters: { skills: new Map([['--layout', 'value']]),
    board: new Map([['--format', 'value']]) } },
};

/**
 * The flags a memory-adapter PLUGIN named by a path takes (AGSC-00-24): on
 * `import`, `--replace`, because a plugin's documents go through the same collision
 * survey as every other lane; on `export`, none. A plugin declares no flags of its
 * own at plugin API 1.0, and one named by a package name takes none.
 */
const PLUGIN_FLAGS = Object.freeze({ import: new Map([['--replace', 'bool']]), export: new Map() });

/** The flags the adapter named in `argv` adds to `verb`, or an empty map. */
function adapterFlagsFor(verb, argv) {
  const scope = ADAPTER_FLAGS[verb];
  if (scope === undefined) return new Map();
  const at = argv.indexOf(scope.selector);
  const named = at === -1 ? undefined : argv[at + 1];
  if (named === undefined) return new Map();
  if (scope.adapters[named]) return scope.adapters[named];
  // Only a PATH is known to name a plugin before anything is resolved; a bare name
  // may be an adapter this engine does not ship, whose flags AGSC-09-09 refuses.
  return pluginLoader.classify(named) === 'path' && PLUGIN_FLAGS[verb] ? PLUGIN_FLAGS[verb] : new Map();
}

/** commander's own dash-to-camel option-key convention (`dry-run` -> `dryRun`). */
function toCamel(kebab) {
  return kebab.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/**
 * buildVerbParser(verb) — a fresh commander Command scoped to one verb's
 * known flags (global + VERB_FLAGS[verb]). AGSC-09-07..12's own exit codes
 * and E001/E002/E003 stay ours: `exitOverride()` turns every parse failure
 * into a thrown CommanderError instead of `process.exit`, and
 * `configureOutput()` silences commander's own text so nothing but our own
 * envelope/finding lines reach stdout/stderr. `--help`/`-h` are disabled
 * (AGSC-09-09 does not name a help flag); an unrecognised `--foo` therefore
 * still falls through to `commander.unknownOption`, mapped to AGSC-E002.
 */
function buildVerbParser(verb, argv) {
  const cmd = new Command();
  cmd.exitOverride();
  cmd.configureOutput({ writeOut: () => {}, writeErr: () => {}, outputError: () => {} });
  cmd.helpOption(false);
  cmd.allowExcessArguments(true); // positional args (e.g. `trace <file.json>`) are the verb's business, not ours
  for (const [flag] of GLOBAL_FLAGS) cmd.option(flag);
  for (const [flag, kind] of flagsFor(verb, argv || [])) {
    cmd.option(kind === 'bool' ? flag : `${flag} <value>`);
  }
  return cmd;
}

/**
 * The first value-taking flag of this verb that `argv` states more than once, or
 * `null`. Only the `--flag value` form is counted; `--flag=value` is counted too,
 * because it is the same flag by another spelling.
 */
function repeatedValueFlag(verb, argv) {
  const seen = new Map();
  for (const [flag, kind] of flagsFor(verb, argv || [])) {
    if (kind !== 'value') continue;
    const count = (argv || []).filter((token) => token === flag
      || String(token).startsWith(`${flag}=`)).length;
    if (count > 1) seen.set(flag, count);
  }
  for (const token of argv || []) {
    const flag = String(token).split('=')[0];
    if (seen.has(flag)) return flag;
  }
  return null;
}

/** This verb's own flags plus the flags of the adapter this invocation names. */
function flagsFor(verb, argv) {
  return new Map([...(VERB_FLAGS[verb] || new Map()), ...adapterFlagsFor(verb, argv)]);
}

/**
 * The port bag every verb receives: `{fs, clock, proc, network}`. `bin/agsc.js`
 * builds the four adapters; a test may pass a bare FileSystem port as `ports`,
 * which is wrapped here so one convention reaches the verbs (integration settled
 * `loadBundle(ports, …)` and `site.build(bundle, ports, …)` on the same bag).
 *
 * The Clock is the one port the shell supplies itself when a caller gives
 * none: AGSC-04-09 makes the build instant `SOURCE_DATE_EPOCH`, which is
 * INJECTED here as `env`, so a verb never has to guess and never reads a wall
 * clock. Its own findings (AGSC-E606 when the instant defaulted to 0) are
 * surfaced by the verbs that emit, not by the shell — `lint` does not read a
 * clock and must not report a build fact.
 */
function portBag(opts, env) {
  const given = opts.ports;
  const bag = given && typeof given === 'object' && given.fs !== undefined ? given : { fs: given };
  const clock = bag.clock === undefined ? opts.clock : bag.clock;
  return {
    clock: clock === undefined ? createClock({ env }) : clock,
    fs: bag.fs,
    network: bag.network === undefined ? opts.network : bag.network,
    proc: bag.proc === undefined ? opts.proc : bag.proc,
  };
}

function readPackageVersion() {
  return require('../../../package.json').version;
}

/**
 * compareFindings — AGSC-09-10: order by (file, line, col, code), code-point-wise.
 */
function compareFindings(a, b) {
  const af = a.file || '';
  const bf = b.file || '';
  if (af !== bf) return af < bf ? -1 : 1;
  const al = typeof a.line === 'number' ? a.line : -1;
  const bl = typeof b.line === 'number' ? b.line : -1;
  if (al !== bl) return al - bl;
  const ac = typeof a.col === 'number' ? a.col : -1;
  const bc = typeof b.col === 'number' ? b.col : -1;
  if (ac !== bc) return ac - bc;
  const acode = a.code || '';
  const bcode = b.code || '';
  if (acode !== bcode) return acode < bcode ? -1 : 1;
  return 0;
}

/**
 * buildEnvelope — AGSC-09-11's fixed shape.
 */
/**
 * The shape of an error code REGISTERED in spec/09 §9.4. `tests/application/
 * cli/main.test.js` checks the three codes the FileSystem adapter throws against the
 * registry itself, so this shape never stands alone as the claim.
 */
const REGISTERED_CODE = /^AGSC-E\d{3}$/u;

function buildEnvelope({ verb, findings, status, specVersion, version }) {
  // AGSC-09-11: every finding with its position, each fault once — the shell adds the
  // loader's findings to the verb's, and a verb such as `ci` already carries them.
  const { uniqueFindings, withPosition } = require('../../knowledge/validate.js');
  const jcs = require('../../knowledge/jcs.js');
  const sorted = uniqueFindings(findings.map(withPosition), jcs.canonicalize).sort(compareFindings);
  const counts = { error: 0, warn: 0 };
  for (const f of sorted) {
    if (f.severity === 'error') counts.error += 1;
    else if (f.severity === 'warn') counts.warn += 1;
  }
  const derivedStatus = status || (counts.error > 0 ? 'fail' : 'pass');
  return {
    counts,
    findings: sorted,
    schema: 'agsc.diagnostics.v1',
    spec_version: specVersion,
    status: derivedStatus,
    verb,
    version,
  };
}

/**
 * The envelope MUST be emitted JCS-canonical (AGSC-09-10/AGSC-04-05). This
 * module never implements its own RFC 8785 writer (-CONTRACT.md): it
 * requires A's knowledge/jcs.js and returns null when that module is not
 * yet present, so a caller can fail closed instead of emitting non-canonical
 * bytes.
 */
function serializeEnvelope(envelope) {
  let jcs;
  try {
    jcs = require('../../knowledge/jcs.js');
  } catch (e) {
    return null;
  }
  if (!jcs || typeof jcs.canonicalize !== 'function') return null;
  return jcs.canonicalize(envelope);
}

function writeLine(stream, text) {
  if (stream && typeof stream.write === 'function') stream.write(text);
}

function writeFindingLine(stderr, f) {
  writeLine(stderr, JSON.stringify(f) + '\n');
}

/**
 * The usage block a person sees when no verb, or no known verb, was given.
 * It names the AGSC-09-07 verb set and the AGSC-09-09 global flags and nothing
 * else — this shell has no manual to duplicate and no rule to paraphrase. It is
 * a DIAGNOSTIC, so it is written to stderr (AGSC-09-10), and it is emitted only
 * outside `--json`, where one line must be one finding object.
 */
const GLOBAL_FLAG_NAMES = Object.freeze(['--json', '--quiet', '--plain', '--no-input', '--help', '--version']);

function usageText(version) {
  return [
    '',
    `agsc ${version} — the reference engine of the Agentic System Core format.`,
    '',
    'Usage: agsc <verb> [flags]',
    '',
    'Verbs (AGSC-09-07):',
    `  ${VERBS.slice(0, 8).join('  ')}`,
    `  ${VERBS.slice(8).join('  ')}`,
    '',
    `Global flags (AGSC-09-09): ${GLOBAL_FLAG_NAMES.join('  ')}`,
    '',
    'Each verb takes its own flags; an unknown flag is AGSC-E002 and exit 2.',
    'A Bundle is the directory holding agsc.config.json; run a verb from inside it.',
    '',
  ].join('\n');
}

/**
 * The positional arguments of each verb, as a usage line. AGSC-09-09 closes the
 * FLAGS; the positionals are what each verb's own rule names (`propose <slug>`,
 * `trace <file.json>`, `mcp [<path>]`, …), and a person asking for help needs both.
 */
const VERB_USAGE = Object.freeze({
  build: 'agsc build [--level <n>]',
  ci: 'agsc ci [--level <n>]',
  compose: 'agsc compose <slug> [<slug>…] | agsc compose --from <slug>',
  conform: 'agsc conform [--level <n>] [--to <path>]',
  export: 'agsc export --markdown|--okf|--jsonld|--jsonl|--steer [--target <name>[,<name>…]]|--to <adapter>',
  import: 'agsc import <source-dir> --from <adapter> [--dry-run]',
  init: 'agsc init',
  lint: 'agsc lint [--fix]',
  mcp: 'agsc mcp [<path>]',
  propose: 'agsc propose <slug>',
  refresh: 'agsc refresh [--agent <name>] [--task <slug>] [--dry-run]',
  review: 'agsc review',
  run: 'agsc run <slug> [--dry-run]',
  skills: 'agsc skills | agsc skills install [<target>] | agsc skills import <file>',
  trace: 'agsc trace <file.json>',
  verify: 'agsc verify [--ledger]',
});

/**
 * AGSC-09-09 (as stated 2026-09-24): a positional argument a verb does not define is
 * `AGSC-E002` with exit 2, exactly like an unknown flag. The table is the one
 * `VERB_USAGE` prints: the number of positionals each verb defines, `Infinity`
 * for `compose <slug> [<slug>…]`. Before this check `export --markdown ./out`
 * was accepted in silence and wrote to `dist/export/markdown/` — the operator
 * named a directory and nothing said it was ignored.
 */
const POSITIONALS_MAX = Object.freeze({
  build: 0, ci: 0, compose: Infinity, conform: 0, export: 0, import: 1, init: 0, lint: 0,
  mcp: 1, propose: 1, refresh: 0, review: 0, run: 1, skills: 2, trace: 1, verify: 0,
});

/** `{adapter: [flag, …]}` of the adapter flags a verb's selector admits (AGSC-01-26a). */
function adapterFlagTable(verb) {
  const scope = ADAPTER_FLAGS[verb];
  if (scope === undefined) return null;
  const table = {};
  for (const name of Object.keys(scope.adapters).sort()) {
    table[name] = [...scope.adapters[name]].map(([flag, kind]) => (kind === 'value' ? `${flag} <value>` : flag));
  }
  return { selector: scope.selector, table };
}

/** The same facts as `helpText`, as data, for the `--json` form. */
function helpDocument(version, verb) {
  const document = { global_flags: [...GLOBAL_FLAG_NAMES], version };
  if (verb === undefined) document.verbs = [...VERBS];
  else {
    document.verb = verb;
    document.flags = [...(VERB_FLAGS[verb] || new Map()).keys()];
    document.usage = VERB_USAGE[verb];
    const adapters = adapterFlagTable(verb);
    if (adapters !== null) document.adapter_flags = adapters.table;
  }
  return document;
}

/**
 * `agsc --help` and `agsc <verb> --help` (AGSC-09-09).
 *
 * "MUST print the verb set of AGSC-09-07 and this flag list to stdout and exit 0;
 * with a verb, it MUST print that verb's flags." It is the one flag that is NOT a
 * diagnostic, so unlike `usageText` it goes to STDOUT (AGSC-09-10), and it is a flag
 * rather than a verb so that AGSC-09-07's sixteen verbs stay sixteen.
 */
function helpText(version, verb) {
  if (verb === undefined) return usageText(version);
  const own = [...(VERB_FLAGS[verb] || new Map())].map(([flag, kind]) => (kind === 'value' ? `${flag} <value>` : flag));
  const adapters = adapterFlagTable(verb);
  const lines = [
    '',
    `agsc ${version} — ${VERB_USAGE[verb]}`,
    '',
    `Flags of ${verb} (AGSC-09-09): ${own.length === 0 ? '(none)' : own.join('  ')}`,
  ];
  if (adapters !== null) {
    lines.push(`Adapter flags (AGSC-01-26a), valid only with the adapter named by ${adapters.selector}:`);
    for (const [name, flags] of Object.entries(adapters.table)) lines.push(`  ${adapters.selector} ${name}: ${flags.join('  ')}`);
  }
  lines.push(`Global flags (AGSC-09-09): ${GLOBAL_FLAG_NAMES.join('  ')}`, '');
  return lines.join('\n');
}

/**
 * main(argv, ctx) -> Promise<number>
 *
 * ctx: { ports, env, stdout, stderr, root, specVersion, version, userConfig }
 * - ports: a FileSystem port (OPTIONAL; only verbs that touch files need it).
 * - env: a snapshot of the process environment ({name: value}); AGSC_* names
 *   are honoured (AGSC-09-09); never read from `process.env` directly here.
 * - root: the Bundle root (default '.').
 * - specVersion/version: OPTIONAL overrides for the envelope's corresponding
 *   members; default to SPEC_VERSION ('1.0.0-rc.6') and package.json's
 *   version. A test
 *   harness pins these per-vector (e.g. cli-0002's options.version) so the
 *   envelope stays reproducible independent of the engine's own release.
 * - userConfig: OPTIONAL pre-loaded user configuration object — the lowest
 *   layer of AGSC-09-09's precedence. bin/agsc.js reads it from
 *   `$XDG_CONFIG_HOME/agsc/config.json` (falling back to
 *   `~/.config/agsc/config.json`) through a second, user-rooted FileSystem
 *   adapter instance (src/README.md documents this decision); `main()`
 *   never touches the filesystem for it directly.
 */
function main(argv, ctx) {
  const opts = ctx || {};
  const stdout = opts.stdout || process.stdout;
  const stderr = opts.stderr || process.stderr;
  const env = opts.env || {};
  const root = opts.root || '.';
  const specVersion = opts.specVersion || SPEC_VERSION;
  const version = opts.version || readPackageVersion();

  const args = Array.isArray(argv) ? argv.slice() : [];
  const jsonMode = args.includes('--json');

  // --version (AGSC-09-09) short-circuits everything else.
  if (args.includes('--version')) {
    if (jsonMode) writeLine(stdout, JSON.stringify({ version }) + '\n');
    else writeLine(stdout, `agsc ${version}\n`);
    return 0;
  }

  // --help (AGSC-09-09) short-circuits too: it is not a diagnostic, so
  // it prints to STDOUT and exits 0, with the named verb's flags when one is given.
  //
  // Under `--json` it takes the shape `--version` already takes: one canonical JSON
  // object on stdout rather than prose. AGSC-09-09 says only "print … to stdout and
  // exit 0", and AGSC-09-10's "exactly one JCS-canonical envelope" governs a verb's
  // DIAGNOSTICS, which `--help` explicitly is not ("the one flag that is not a
  // diagnostic"). Printing a usage block into a `--json` pipeline would be the one
  // reading that serves nobody. Recorded as a reading in the report.
  if (args.includes('--help')) {
    const named = args.find((a) => VERBS.includes(a));
    if (jsonMode) {
      const document = helpDocument(version, named);
      writeLine(stdout, `${serializeEnvelope(document) || JSON.stringify(document)}\n`);
    } else {
      writeLine(stdout, helpText(version, named));
    }
    return 0;
  }

  // AGSC-09-08: a malformed SOURCE_DATE_EPOCH is AGSC-E603, exit 2, never a finding.
  // the predicate is the Clock adapter's own, so the pre-flight check here
  // and the adapter that builds the clock a moment later cannot disagree about which
  // values are malformed.
  if (Object.prototype.hasOwnProperty.call(env, 'SOURCE_DATE_EPOCH')) {
    const raw = String(env.SOURCE_DATE_EPOCH);
    if (isMalformedEpoch(raw)) {
      if (jsonMode) writeFindingLine(stderr, { code: 'AGSC-E603', severity: 'error', message: 'SOURCE_DATE_EPOCH is malformed' });
      else writeLine(stderr, 'agsc: AGSC-E603 SOURCE_DATE_EPOCH is malformed\n');
      return 2;
    }
  }

  // The port bag is built only once AGSC-09-08's environment check has passed:
  // the Clock adapter REFUSES a malformed `SOURCE_DATE_EPOCH` by throwing, and
  // that fault is the shell's AGSC-E603 exit 2, never an exception.
  const ports = portBag(opts, env);

  const verb = args.length > 0 && !args[0].startsWith('-') ? args[0] : null;

  if (!verb || !VERBS.includes(verb)) {
    // AGSC-09-07: anything that is not one of the sixteen verbs is `AGSC-E001`,
    // exit 2 — including `--help`, which AGSC-09-09 does not make a global flag.
    // But the answer must still tell a person what to do: the message names
    // what was typed (or says that nothing was), and the human stream carries the
    // verb list. Under `--json` stderr stays exactly ONE finding object per line
    // (AGSC-09-10), so the usage block is printed only in the human mode.
    const message = verb === null
      ? 'no verb given'
      : `unknown verb ${JSON.stringify(verb)}`;
    if (jsonMode) writeFindingLine(stderr, { code: 'AGSC-E001', severity: 'error', message });
    else {
      writeLine(stderr, `agsc: AGSC-E001 ${message}\n`);
      writeLine(stderr, usageText(version));
    }
    return 2;
  }

  const rest = args.slice(1);
  // AGSC-09-09 types every verb flag as taking ONE value, and AGSC-01-28 says so of
  // `--target` in as many words: "one comma-separated list of registry names, never
  // a repeated flag". Commander silently keeps the LAST
  // occurrence of a repeated value flag, so `--target agents --target claude` used
  // to export `claude` alone and say nothing — a silent loss of what the operator
  // asked for. The repetition is a usage error, and AGSC-09-08 makes it exit 2.
  const repeated = repeatedValueFlag(verb, rest);
  if (repeated !== null) {
    const message = `${repeated} is given more than once; every flag takes one value`
      + ' (AGSC-09-09), and a list is written as one comma-separated value'
      + ` (e.g. ${repeated} a,b)`;
    if (jsonMode) writeFindingLine(stderr, { code: 'AGSC-E002', severity: 'error', message });
    else writeLine(stderr, `agsc: AGSC-E002 ${message}\n`);
    return 2;
  }
  const parser = buildVerbParser(verb, rest);
  let parsed;
  try {
    parsed = parser.parse(rest, { from: 'user' });
  } catch (e) {
    // Map commander's own error taxonomy onto AGSC-09-08's usage-error codes.
    const code = e && e.code === 'commander.optionMissingArgument' ? 'AGSC-E003' : 'AGSC-E002';
    const base = (e && e.message) || 'usage error';
    const hint = retiredFlagHint(verb, rest);
    const message = hint === null ? base : `${base} — ${hint}`;
    if (jsonMode) writeFindingLine(stderr, { code, severity: 'error', message });
    else writeLine(stderr, `agsc: ${code} ${message}\n`);
    return 2;
  }

  const commanderOpts = parsed.opts();
  const flags = {
    json: commanderOpts.json === true,
    quiet: commanderOpts.quiet === true,
    plain: commanderOpts.plain === true,
    noInput: commanderOpts.input === false, // commander's `--no-input` negation convention
  };
  const verbFlags = {};
  for (const [flag, kind] of flagsFor(verb, rest)) {
    const key = flag.slice(2);
    const value = commanderOpts[toCamel(key)];
    if (value !== undefined) verbFlags[key] = kind === 'bool' ? value === true : value;
  }
  const positionals = parsed.args.slice();
  const positionalsMax = POSITIONALS_MAX[verb] === undefined ? 0 : POSITIONALS_MAX[verb];
  if (positionals.length > positionalsMax) {
    const extra = positionals.slice(positionalsMax).map((a) => JSON.stringify(a)).join(', ');
    const message = positionalsMax === 0
      ? `${verb} takes no positional argument (AGSC-09-09); ${extra} given — usage: ${VERB_USAGE[verb]}`
      : `${verb} takes at most ${positionalsMax} positional argument(s) (AGSC-09-09); ${extra} given — usage: ${VERB_USAGE[verb]}`;
    if (jsonMode) writeFindingLine(stderr, { code: 'AGSC-E002', severity: 'error', message });
    else writeLine(stderr, `agsc: AGSC-E002 ${message}\n`);
    return 2;
  }

  // Resolve configuration once, for every verb (AGSC-09-09/AGSC-01-37).
  // AGSC-11-01: the boundary chapter's numeric and enumerated parameters are
  // range-checked here — the check lives in `boundary/visibility.js`, the
  // anti-corruption layer that owns AGSC-11-01, and is INJECTED because the
  // Knowledge context may not require Boundary (the context map).
  const loaded = load({
    root, ports: ports.fs, env, argvFlags: {}, userConfig: opts.userConfig, checkBoundary: checkBoundaryConfig,
  });

  // AGSC-09-94 (as amended 2026-09-24): run/trace are opt-in, disabled unless
  // run.enabled is true; with it false, both exit 2 with AGSC-E004 — a
  // configuration the tool cannot run against (AGSC-09-08's exit-2 class). Until
  // then the code was AGSC-E001, which is registered for an unknown verb, on a verb
  // the engine knows.
  if ((verb === 'run' || verb === 'trace')) {
    const enabled = !!(loaded.config && loaded.config.run && loaded.config.run.enabled === true);
    if (!enabled) {
      if (jsonMode) writeFindingLine(stderr, { code: 'AGSC-E004', severity: 'error', message: `${verb} is disabled (run.enabled is false)` });
      else writeLine(stderr, `agsc: AGSC-E004 ${verb} is disabled (run.enabled is false)\n`);
      return 2;
    }
  }

  let verbModule;
  try {
    verbModule = require(`./verbs/${verb}.js`);
  } catch (e) {
    verbModule = null;
  }

  const verbCtx = {
    argv: positionals,
    flags,
    verbFlags,
    config: loaded.config,
    sources: loaded.sources,
    envOverrides: loaded.envOverrides,
    ignoredEnvNames: loaded.ignoredEnvNames,
    credentials: loaded.credentials,
    ports,
    env,
    root,
    stdout,
    stderr,
    specVersion,
    version,
  };

  // AGSC-09-13: a streaming verb owns stdout. Nothing but its own protocol
  // bytes may appear there, so the shell writes its findings to stderr and
  // emits no envelope at all.
  if (STREAMING_VERBS.has(verb)) {
    for (const f of (loaded.findings || [])) writeFindingLine(stderr, f);
    if (!verbModule || typeof verbModule.run !== 'function') {
      writeFindingLine(stderr, { code: 'AGSC-E001', severity: 'error', message: `${verb}: no implementation` });
      return 2;
    }
    return Promise.resolve()
      .then(() => verbModule.run(verbCtx))
      .then(() => 0, (e) => {
        writeFindingLine(stderr, { code: 'AGSC-E901', severity: 'error', message: `${verb}: ${e && e.message}` });
        return 1;
      });
  }

  // Every verb of AGSC-09-07 has a module (tests/application/cli/verbs-sixteen
  // .test.js proves it), so a missing one is a packaging fault, not a domain
  // fact, and it keeps the internal-error path.
  //
  // a thrown error is NOT always a programming fault. The FileSystem
  // adapter throws `AGSC-E902`/`AGSC-E903`/`AGSC-E904` and the clock throws
  // `AGSC-E603` — codes REGISTERED in spec/09 §9.4, so each is a domain fact
  // and becomes a Finding in the AGSC-09-11 envelope with the AGSC-09-08 exit
  // code. Only a fault carrying no registered code keeps the internal-error
  // path, and that path still prints NOTHING on stdout, so AGSC-09-10's
  // "exactly one envelope on stdout under --json" holds either way.
  let result;
  try {
    if (!verbModule || typeof verbModule.run !== 'function') {
      writeLine(stderr, `agsc: internal error: ${verb}: no verb module (AGSC-09-07)\n`);
      return 1;
    }
    result = verbModule.run(verbCtx);
  } catch (e) {
    const code = e && typeof e.code === 'string' ? e.code : '';
    if (!REGISTERED_CODE.test(code)) {
      writeLine(stderr, `agsc: internal error: ${verb}: ${e && e.message}\n`);
      return 1;
    }
    result = {
      findings: [{
        code,
        col: 1,
        file: (e && typeof e.file === 'string') ? e.file : '',
        line: 1,
        message: String((e && e.message) || code),
        severity: 'error',
      }],
      status: 'fail',
    };
  }

  const findings = (loaded.findings || []).concat((result && result.findings) || []);
  const status = (result && result.status) || undefined;
  const envelope = buildEnvelope({ verb, findings, status, specVersion, version });

  if (jsonMode) {
    const bytes = serializeEnvelope(envelope);
    if (bytes === null) {
      // AGSC-04-05/09-10: cannot emit a non-canonical envelope; fail closed.
      writeFindingLine(stderr, { code: 'AGSC-E601', severity: 'error', message: 'JCS canonicalizer unavailable (src/knowledge/jcs.js not yet implemented); envelope not emitted' });
      return 1;
    }
    writeLine(stdout, bytes + '\n');
    for (const f of envelope.findings) writeFindingLine(stderr, f);
  } else {
    writeLine(stdout, `${verb}: ${envelope.status} (${envelope.counts.error} error, ${envelope.counts.warn} warn)\n`);
    for (const f of envelope.findings) writeLine(stderr, `${f.severity}: ${f.code} ${f.message || ''}${plainWhere(f)}\n`);
  }

  // AGSC-09-08: the exit code names the CLASS of the fault, not its severity.
  // "2 for an unknown verb, an unknown flag, a missing argument or invalid
  // configuration" — so an error whose code says the configuration is invalid
  // exits 2 wherever it is raised, and every other error exits 1. A Bundle whose
  // `agsc.config.json` carries a key this version does not define must not exit 1,
  // which a caller reads as "the content failed a gate" rather than
  // "this tool cannot run against this configuration at all" — and AGSC-00-21's
  // whole point is that configuration is the one surface where a newer version
  // must fail loudly (AGSC-00-23, AGSC-00-25, AGSC-01-22).
  if (envelope.status !== 'pass'
    && envelope.findings.some((f) => f.severity === 'error' && USAGE_CLASS_CODES.has(f.code))) {
    return 2;
  }
  return envelope.status === 'pass' ? 0 : 1;
}

/**
 * AGSC-09-10: where a finding is, on its plain line — ` — <file>[:<line>]` — so a
 * person reading without `--json` can find the fault. Omitted when the finding names
 * no file or its message already names it.
 */
function plainWhere(f) {
  const file = typeof f.file === 'string' ? f.file : '';
  if (file === '' || String(f.message || '').includes(file)) return '';
  return ` — ${file}${Number.isInteger(f.line) && f.line > 1 ? `:${f.line}` : ''}`;
}

module.exports = {
  main, RETIRED_FLAGS, SPEC_VERSION, USAGE_CLASS_CODES, VERBS, VERB_FLAGS, VERB_USAGE,
  adapterFlagsFor, buildEnvelope, compareFindings, flagsFor,
};
