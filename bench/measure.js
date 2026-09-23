'use strict';
/**
 * bench/measure.js — the pre-GA measurements runner (research/39 Layers A–E).
 *
 * What it is, and what it is not. This script produces `docs/measurements.json`,
 * the generated record that `docs/MEASUREMENTS.md` reads from. It is NOT the
 * `bench` verb: `bench` is the v1.0.1 gate (docs/PRD.md §4) and covers the
 * retrieval and memory studies, which need a corpus and a judge model. The five
 * layers here need no model, no network, no dataset licence and no key, and
 * they are the layers that carry the specification's own property claims, so
 * they run before GA and against artefacts the engine already produces.
 *
 *   node bench/measure.js --layer conformance --scratch <dir>
 *   node bench/measure.js --layer perf        --scratch <dir>
 *   node bench/measure.js --assemble --scratch <dir> --out docs/measurements.json
 *
 * Every layer writes `<scratch>/measure-<layer>.json` and every number in it
 * carries the `command` that produced it, so a reader can re-run one line
 * rather than the whole script.
 *
 * Determinism. The script itself reads no clock: the report date comes from
 * `SOURCE_DATE_EPOCH`, the project's standing convention, and a run without it
 * is refused rather than dated from the wall clock. Wall-clock DURATIONS are
 * measured with the monotonic counter (`process.hrtime.bigint`) and with GNU
 * `time -v` for peak resident memory; those are measurements of this machine
 * on this day, and research/39 §6 requires them to be reported with the machine
 * and the run count attached and never as a comparison with another system.
 *
 * Coverage note. This orchestrator spawns real builds that take minutes, so no
 * unit test drives it and it is outside the coverage set on purpose; its
 * arithmetic lives in `bench/metrics.js`, which is tested, and its generator in
 * `bench/gen-bundle.js`, which is tested.
 */

/* c8 ignore start — the orchestrator spawns multi-minute builds; see the header. */

const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const metrics = require('./metrics.js');

const REPO = path.resolve(__dirname, '..');
const NODE = process.execPath;
const AGSC = path.join(REPO, 'bin', 'agsc.js');
const EPOCH = '1767225600';   // 2026-01-01T00:00:00Z — the project's fixed clock

const LAYERS = Object.freeze(['conformance', 'determinism', 'security', 'perf', 'retrieval', 'parity', 'tokens', 'package']);

const HELP = `measure --layer <name> --scratch <dir> [--json]
measure --assemble --scratch <dir> --out <file>

  Runs one measurement layer of docs/MEASUREMENTS.md and writes
  <scratch>/measure-<layer>.json, or assembles every partial into one record.

  --layer <name>   one of: ${LAYERS.join(' ')}
  --scratch <dir>  working directory OUTSIDE this repository (required)
  --assemble       merge every partial found in <dir> into --out
  --out <file>     where --assemble writes (default docs/measurements.json)
  --json           print the partial on stdout as well

  SOURCE_DATE_EPOCH must be set; the script reads no wall clock.
  Exit 0 measured, 1 a layer could not run, 2 usage.
`;

/** Run a command, capture everything, and report the elapsed monotonic nanoseconds. */
function timed(command, args, options) {
  const started = process.hrtime.bigint();
  const result = cp.spawnSync(command, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...options });
  const ns = process.hrtime.bigint() - started;
  return { code: result.status, err: result.stderr || '', ms: Number(ns / 1000000n), out: result.stdout || '' };
}

/** The same, through GNU `time -v`, which also reports peak resident set size. */
function timedWithRss(command, args, options) {
  const result = timed('/usr/bin/time', ['-v', command, ...args], options);
  const match = /Maximum resident set size \(kbytes\): (\d+)/u.exec(result.err);
  return { ...result, rss_kb: match ? Number(match[1]) : null };
}

/** Total bytes of a directory tree, and how many files it holds. */
function treeSize(dir) {
  let bytes = 0;
  let files = 0;
  let largest = 0;
  let largestPath = null;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const where = path.join(d, entry.name);
      if (entry.isDirectory()) walk(where);
      else {
        const size = fs.statSync(where).size;
        bytes += size;
        files += 1;
        if (size > largest) { largest = size; largestPath = path.relative(dir, where); }
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return { bytes, files, largest_bytes: largest, largest_path: largestPath };
}

/** Every rule id the specification declares, and which of them are reserved. */
function specRules() {
  const active = [];
  const all = [];
  for (const name of fs.readdirSync(path.join(REPO, 'spec')).sort()) {
    if (!name.endsWith('.md')) continue;
    const text = fs.readFileSync(path.join(REPO, 'spec', name), 'utf8');
    for (const line of text.split('\n')) {
      const m = /^-\s+\*\*(AGSC-\d{2}-\d{2}[a-z]?)\*\*/u.exec(line);
      if (!m) continue;
      all.push(m[1]);
      if (!/reserved/iu.test(line.slice(0, 200))) active.push(m[1]);
    }
  }
  return { active: [...new Set(active)], all: [...new Set(all)] };
}

/** Every rule id cited inside a tree, by file extension. */
function citedIn(dir, extensions) {
  const ids = new Set();
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const where = path.join(d, entry.name);
      if (entry.isDirectory()) { walk(where); continue; }
      if (extensions.length > 0 && !extensions.some((e) => entry.name.endsWith(e))) continue;
      const text = fs.readFileSync(where, 'utf8');
      for (const m of text.matchAll(/AGSC-\d{2}-\d{2}[a-z]?/gu)) ids.add(m[0]);
    }
  };
  walk(dir);
  return [...ids];
}

/** Every vector, flattened: `{ id, area, rule[], status }`. */
function vectors() {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const where = path.join(d, entry.name);
      if (entry.isDirectory()) { walk(where); continue; }
      if (!entry.name.endsWith('.json')) continue;
      const json = JSON.parse(fs.readFileSync(where, 'utf8'));
      out.push({
        area: json.area,
        id: json.id,
        rule: Array.isArray(json.rule) ? json.rule : [json.rule].filter(Boolean),
        status: json.status || 'required',
      });
    }
  };
  walk(path.join(REPO, 'tests', 'vectors'));
  return out;
}

// ---------------------------------------------------------------- Layer A ----

function layerConformance() {
  const counter = timed(NODE, [path.join(REPO, 'tools', 'count-artifacts'), '--json'], { cwd: REPO });
  const counts = JSON.parse(counter.out).counts;

  const runner = timed(NODE, ['--test', 'tests/conformance/vector-runner.test.js'], { cwd: REPO, env: { ...process.env, SOURCE_DATE_EPOCH: EPOCH } });
  const summary = /vectors: (\d+) pass, (\d+) fail, (\d+) skip \((\d+) withdrawn, (\d+) pending\) of (\d+)/u.exec(`${runner.out}${runner.err}`);

  const all = vectors();
  const perArea = Object.create(null);
  for (const v of all) {
    const area = v.area || 'unknown';
    perArea[area] = perArea[area] || { optional: 0, required: 0, total: 0, withdrawn: 0 };
    perArea[area].total += 1;
    perArea[area][v.status] = (perArea[area][v.status] || 0) + 1;
  }

  const rules = specRules();
  const coverage = metrics.ruleCoverage({
    active: rules.active,
    namedByChecker: citedIn(path.join(REPO, 'tools'), []),
    namedByFeature: citedIn(path.join(REPO, 'features'), ['.feature']),
    namedByTest: citedIn(path.join(REPO, 'tests'), ['.test.js', '.js']),
    withVector: all.filter((v) => v.status !== 'withdrawn').flatMap((v) => v.rule),
  });

  const validators = {};
  for (const name of ['validate-spec', 'validate-schemas', 'validate-ontology', 'validate-vectors',
    'validate-features', 'validate-diagrams']) {
    const r = timed(NODE, [path.join(REPO, 'tools', name), '--json'], { cwd: REPO });
    let envelope = null;
    try { envelope = JSON.parse(r.out); } catch { envelope = null; }
    validators[name] = {
      exit: r.code,
      findings: envelope && Array.isArray(envelope.findings) ? envelope.findings.length : null,
      inputs_read: envelope && envelope.counts ? (envelope.counts.inputs_read ?? null) : null,
      ok: envelope ? envelope.ok : null,
    };
  }

  return {
    command: 'node bench/measure.js --layer conformance',
    error_codes: { registered: counts.error_codes_registered, used: counts.error_codes_used },
    rule_coverage: coverage,
    rule_coverage_by_chapter: {
      active: metrics.byChapter(rules.active),
      uncovered: metrics.byChapter(coverage.uncovered),
    },
    rules: { active: counts.rules_active, reserved: counts.rules_reserved, total: counts.rules },
    validators,
    vector_areas: Object.keys(perArea).sort().reduce((acc, k) => { acc[k] = perArea[k]; return acc; }, Object.create(null)),
    vector_run: summary ? {
      fail: Number(summary[2]), pass: Number(summary[1]), pending: Number(summary[5]),
      skip: Number(summary[3]), total: Number(summary[6]), withdrawn: Number(summary[4]),
    } : null,
    vectors: {
      optional: counts.vectors_optional, required: counts.vectors_required,
      total: counts.vectors_total, withdrawn: counts.vectors_withdrawn,
    },
  };
}

// ---------------------------------------------------------------- Layer B ----

/**
 * Copy a Bundle into a working directory and build it there, so that nothing is
 * written inside the repository and each run starts from the same bytes.
 * `build.out` is part of the Bundle's own configuration, so the output lands at
 * `<work>/www`; the caller compares those trees.
 */
function buildInto(bundleDir, work, env) {
  fs.rmSync(work, { force: true, recursive: true });
  fs.cpSync(bundleDir, work, { recursive: true });
  const result = timed(NODE, [AGSC, 'build', '--json'], {
    cwd: work,
    env: { ...process.env, SOURCE_DATE_EPOCH: EPOCH, ...env },
  });
  const outDir = path.join(work, 'www');
  return { ...result, outDir, tree: treeSize(outDir) };
}

/** Byte comparison of two trees: equal file sets and equal contents. */
function diffTrees(a, b) {
  const list = (root) => {
    const out = [];
    const walk = (d, prefix) => {
      if (!fs.existsSync(d)) return;
      for (const entry of fs.readdirSync(d, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : 1))) {
        const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isDirectory()) walk(path.join(d, entry.name), rel);
        else out.push(rel);
      }
    };
    walk(root, '');
    return out;
  };
  const left = list(a);
  const right = list(b);
  const onlyLeft = left.filter((f) => !right.includes(f));
  const onlyRight = right.filter((f) => !left.includes(f));
  const different = [];
  for (const rel of left) {
    if (!right.includes(rel)) continue;
    if (!fs.readFileSync(path.join(a, rel)).equals(fs.readFileSync(path.join(b, rel)))) different.push(rel);
  }
  return { compared: left.length, different, only_left: onlyLeft, only_right: onlyRight };
}

function layerDeterminism(scratch) {
  const bundle = path.join(REPO, 'tests', 'fixtures', 'minimal');
  const base = path.join(scratch, 'det');
  fs.mkdirSync(base, { recursive: true });

  const runs = {
    // (1) two clean builds, same environment
    a: buildInto(bundle, path.join(base, 'a'), {}),
    b: buildInto(bundle, path.join(base, 'b'), {}),
    // (2) different time zone and different locale
    tz: buildInto(bundle, path.join(base, 'tz'), { LC_ALL: 'de_DE.UTF-8', TZ: 'Asia/Tokyo' }),
    utc: buildInto(bundle, path.join(base, 'utc'), { LC_ALL: 'C', TZ: 'UTC' }),
  };

  const verify = timed(NODE, [AGSC, 'verify', '--json'], {
    cwd: bundle, env: { ...process.env, SOURCE_DATE_EPOCH: EPOCH },
  });

  return {
    command: 'node bench/measure.js --layer determinism',
    double_build: diffTrees(path.join(base, 'a'), path.join(base, 'b')),
    files_compared: runs.a.tree.files,
    os_matrix: {
      note: 'A second operating system cannot be measured on this machine; the CI matrix is the only place it can be run.',
      ran_here: [`${os.type()} ${os.release()} ${os.arch()}`],
    },
    tz_locale: diffTrees(path.join(base, 'utc'), path.join(base, 'tz')),
    verify_verb: { exit: verify.code, ok: verify.code === 0 },
  };
}

// ---------------------------------------------------------------- Layer C ----

function layerSecurity() {
  const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus', 'security-floor.json'), 'utf8'));
  const injection = require(path.join(REPO, 'src', 'governance', 'injection.js'));
  const secrets = require(path.join(REPO, 'src', 'governance', 'secrets.js'));
  const pii = require(path.join(REPO, 'src', 'governance', 'pii.js'));
  const cleanroom = require(path.join(REPO, 'src', 'governance', 'cleanroom.js'));

  const detectors = { cleanroom, injection, pii, secrets };
  const perDetector = Object.create(null);
  const perClass = Object.create(null);

  for (const c of corpus.cases) {
    const check = detectors[c.detector];
    const findings = check.check({ body: c.text, frontmatter: c.frontmatter || {}, path: c.path || 'content/concepts/case.md', slug: 'case' });
    const detected = Array.isArray(findings) && findings.length > 0;
    const row = { detected, expected: c.expected };
    perDetector[c.detector] = perDetector[c.detector] || [];
    perDetector[c.detector].push(row);
    perClass[c.class] = perClass[c.class] || [];
    perClass[c.class].push({ ...row, codes: (findings || []).map((f) => f.code) });
  }

  const scored = Object.create(null);
  for (const name of Object.keys(perDetector).sort()) scored[name] = metrics.detectorScore(perDetector[name]);
  const classes = Object.create(null);
  for (const name of Object.keys(perClass).sort()) {
    classes[name] = {
      ...metrics.detectorScore(perClass[name]),
      codes: [...new Set(perClass[name].flatMap((r) => r.codes))].sort(),
    };
  }

  return {
    by_class: classes,
    by_detector: scored,
    command: 'node bench/measure.js --layer security',
    corpus: { cases: corpus.cases.length, file: 'bench/corpus/security-floor.json', version: corpus.version },
    limit: 'AGSC-08-19: these lints prove neither safety nor the absence of novel injection. An implementation MUST NOT claim more.',
  };
}

// ---------------------------------------------------------------- Layer D ----

function layerPerf(scratch, sizes, runsPerSize) {
  const rows = [];
  for (const items of sizes) {
    const bundleDir = path.join(scratch, `n${items}`);
    fs.rmSync(bundleDir, { force: true, recursive: true });
    require('./gen-bundle.js').run(['--items', String(items), '--out', bundleDir], { err: () => {}, out: () => {} });

    const times = [];
    const rss = [];
    let tree = null;
    let indexBytes = null;
    let chunkBytes = null;
    let shards = 0;
    for (let run = 0; run < runsPerSize; run += 1) {
      const outDir = path.join(bundleDir, 'www');
      fs.rmSync(outDir, { force: true, recursive: true });
      const result = timedWithRss(NODE, [AGSC, 'build', '--json'], {
        cwd: bundleDir, env: { ...process.env, SOURCE_DATE_EPOCH: EPOCH },
      });
      times.push(result.ms);
      rss.push(result.rss_kb);
      if (run === runsPerSize - 1) {
        tree = treeSize(outDir);
        indexBytes = fs.existsSync(path.join(outDir, 'search.json')) ? fs.statSync(path.join(outDir, 'search.json')).size : null;
        shards = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => /^search-\d+\.json$/u.test(f)).length : 0;
        for (const f of fs.readdirSync(outDir)) {
          if (/^search-\d+\.json$/u.test(f)) indexBytes = Math.max(indexBytes || 0, fs.statSync(path.join(outDir, f)).size);
        }
        chunkBytes = fs.existsSync(path.join(outDir, 'chunks.jsonl')) ? fs.statSync(path.join(outDir, 'chunks.jsonl')).size : null;
      }
    }
    rows.push({
      bytes_per_item_index: indexBytes === null ? null : Math.round(indexBytes / items),
      chunks_bytes: chunkBytes,
      chunks_bytes_per_item: chunkBytes === null ? null : Math.round(chunkBytes / items),
      files: tree.files,
      index_bytes_largest: indexBytes,
      index_shards: shards,
      items,
      largest_page_bytes: tree.largest_bytes,
      largest_page_path: tree.largest_path,
      ms_median: metrics.median(times),
      ms_runs: times,
      output_bytes: tree.bytes,
      rss_kb_median: metrics.median(rss.filter((v) => v !== null)),
      rss_kb_runs: rss,
    });
    fs.rmSync(path.join(bundleDir, 'www'), { force: true, recursive: true });
  }
  return {
    budgets: {
      build_seconds_per_500_items: 60,
      index_bytes: 1048576,
      page_bytes: 102400,
    },
    command: `node bench/measure.js --layer perf   # sizes ${sizes.join(' ')}, ${runsPerSize} runs each, median`,
    machine: {
      arch: os.arch(), cpus: os.cpus().length, model: (os.cpus()[0] || {}).model || null,
      node: process.version, platform: `${os.type()} ${os.release()}`, total_mem_bytes: os.totalmem(),
    },
    rows,
    runs_per_size: runsPerSize,
  };
}

// ---------------------------------------------------------------- Layer F ----

function layerParity() {
  const loader = require(path.join(REPO, 'src', 'distribution', 'mcp-tools.js'));
  const pageTools = require(path.join(REPO, 'src', 'distribution', 'webmcp.js'));
  const manifestNames = (m) => (Array.isArray(m) ? m : (m.tools || [])).map((t) => t.name).sort();

  // The comparison the rule actually makes (AGSC-09-16 as amended at rc.6): the
  // same call on both transports is equal AS VALUES, not byte-identical.
  const calls = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus', 'parity-calls.json'), 'utf8'));
  return {
    command: 'node bench/measure.js --layer parity',
    note: 'The measured comparison is the one AGSC-09-16 makes at rc.6: equal as values across the browser boundary, never byte-identical.',
    planned_calls: calls.calls.length,
    tools_page: manifestNames(pageTools.MANIFEST || []),
    tools_server: manifestNames(loader.MANIFEST || []),
  };
}

// ------------------------------------------------------------ assembling ----

function partialPath(scratch, layer) { return path.join(scratch, `measure-${layer}.json`); }

function assemble(scratch, out) {
  const record = { layers: Object.create(null), schema: 'agsc.measurements.v1' };
  for (const layer of LAYERS) {
    const where = partialPath(scratch, layer);
    if (fs.existsSync(where)) record.layers[layer] = JSON.parse(fs.readFileSync(where, 'utf8'));
  }
  record.measured_for = new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString().slice(0, 10);
  const counter = JSON.parse(cp.execFileSync(NODE, [path.join(REPO, 'tools', 'count-artifacts'), '--json'], { cwd: REPO, encoding: 'utf8' }));
  record.spec_version = counter.counts.spec_version;
  fs.writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

function run(argv, io) {
  const out = (io && io.out) || ((s) => process.stdout.write(s));
  const err = (io && io.err) || ((s) => process.stderr.write(s));
  const usage = (message) => { err(`measure: ${message}\n${HELP}`); return 2; };

  let layer = null;
  let scratch = null;
  let target = path.join(REPO, 'docs', 'measurements.json');
  let json = false;
  let doAssemble = false;
  let sizes = [100, 500, 501, 1000, 5000, 10000];
  let runsPerSize = 3;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { out(HELP); return 0; }
    else if (arg === '--layer') { i += 1; layer = argv[i]; }
    else if (arg === '--scratch') { i += 1; scratch = argv[i]; }
    else if (arg === '--out') { i += 1; target = argv[i]; }
    else if (arg === '--sizes') { i += 1; sizes = String(argv[i]).split(',').map(Number); }
    else if (arg === '--runs') { i += 1; runsPerSize = Number(argv[i]); }
    else if (arg === '--assemble') doAssemble = true;
    else if (arg === '--json') json = true;
    else return usage(`unknown argument ${arg}`);
  }
  if (!process.env.SOURCE_DATE_EPOCH) return usage('SOURCE_DATE_EPOCH must be set; this script reads no wall clock');
  if (typeof scratch !== 'string' || scratch === '') return usage('--scratch <dir> is required');
  fs.mkdirSync(scratch, { recursive: true });

  if (doAssemble) {
    const record = assemble(scratch, target);
    out(`measure: assembled ${Object.keys(record.layers).length} layers into ${target}\n`);
    return 0;
  }
  if (!LAYERS.includes(layer)) return usage(`--layer must be one of: ${LAYERS.join(' ')}`);

  let partial = null;
  if (layer === 'conformance') partial = layerConformance();
  else if (layer === 'determinism') partial = layerDeterminism(scratch);
  else if (layer === 'security') partial = layerSecurity();
  else if (layer === 'perf') partial = layerPerf(scratch, sizes, runsPerSize);
  else if (layer === 'parity') partial = layerParity();
  else return usage(`layer ${layer} is produced by its own command; see docs/MEASUREMENTS.md`);

  fs.writeFileSync(partialPath(scratch, layer), `${JSON.stringify(partial, null, 2)}\n`);
  if (json) out(`${JSON.stringify(partial, null, 2)}\n`);
  else out(`measure: ${layer} written to ${partialPath(scratch, layer)}\n`);
  return 0;
}

if (require.main === module) process.exit(run(process.argv.slice(2)));

module.exports = { HELP, LAYERS, run };

/* c8 ignore stop */
