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

const LAYERS = Object.freeze(['conformance', 'determinism', 'security', 'perf', 'retrieval', 'parity', 'tokens', 'a11y', 'package']);

const HELP = `measure --layer <name> --scratch <dir> [--json]
measure --assemble --scratch <dir> --out <file>

  Runs one measurement layer of docs/MEASUREMENTS.md and writes
  <scratch>/measure-<layer>.json, or assembles every partial into one record.

  --layer <name>   one of: ${LAYERS.join(' ')}
  --scratch <dir>  working directory OUTSIDE this repository (required)
  --assemble       merge every partial found in <dir> into --out
  --out <file>     where --assemble writes (default docs/measurements.json)
  --nodes <list>   name=dir,… — Bundles (parity) or build outputs (tokens,
                   a11y, retrieval); the record carries the names only
  --exports <list> name=dir,… — each node's llm-context export (tokens)
  --sizes <list>   item counts for perf (default 100,500,501,1000,5000,10000)
  --runs <n>       runs per size for perf (default 3)
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

function layerSecurity(scratch) {
  const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus', 'security-floor.json'), 'utf8'));
  const result = require('./security.js').score(corpus, { scratch });
  return {
    by_class: result.by_class,
    by_kind: result.by_kind,
    cases: result.cases.map((c) => ({
      class: c.class, codes: c.codes, expect: c.expect, id: c.id, kind: c.kind, outcome: c.outcome, required: c.required,
    })),
    command: 'node bench/measure.js --layer security --scratch <dir>',
    corpus: { cases: corpus.cases.length, file: 'bench/corpus/security-floor.json', version: corpus.version },
    limit: 'AGSC-08-19: these lints prove neither safety nor the absence of novel injection. An implementation MUST NOT claim more.',
    totals: result.totals,
  };
}

/** `name=dir,name=dir` → [[name, dir]]; the names, never the paths, reach the record. */
function namedDirs(spec) {
  return String(spec || '').split(',').filter(Boolean).map((pair) => {
    const at = pair.indexOf('=');
    return [pair.slice(0, at), pair.slice(at + 1)];
  });
}

async function layerParity(nodes) {
  const spec = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus', 'parity-calls.json'), 'utf8'));
  const parity = require('./parity.js');
  const per = Object.create(null);
  const totals = { calls: 0, equal: 0, transport_equal: 0, unpublished_answered_e301: 0, unpublished_calls: 0 };
  for (const [name, dir] of nodes) {
    per[name] = await parity.run(dir, spec);
    for (const k of Object.keys(totals)) totals[k] += per[name][k];
  }
  return {
    call_list: { file: 'bench/corpus/parity-calls.json', fixed: spec.calls.length, per_item: spec.per_item.length, version: spec.version },
    command: 'node bench/measure.js --layer parity --nodes <name>=<bundle dir>,…',
    nodes: per,
    note: 'Compared as values after a JSON round trip, which is what AGSC-09-16 claims at rc.6; never byte-identical across the browser boundary.',
    totals,
  };
}

function layerTokens(nodes, exports) {
  const tokens = require('./tokens.js');
  let o200k;
  let cl100k;
  let version;
  try {
    o200k = require('gpt-tokenizer/encoding/o200k_base');
    cl100k = require('gpt-tokenizer/encoding/cl100k_base');
    version = require('gpt-tokenizer/package.json').version;
  } catch {
    return { command: 'node bench/measure.js --layer tokens', status: 'not run', reason: 'gpt-tokenizer is not resolvable; install it outside the repository and set NODE_PATH' };
  }
  const encoders = {
    cl100k_base: (t) => cl100k.encode(t, { allowedSpecial: 'all' }).length,
    o200k_base: (t) => o200k.encode(t, { allowedSpecial: 'all' }).length,
  };
  const exportOf = new Map(exports);
  const per = Object.create(null);
  for (const [name, www] of nodes) per[name] = tokens.count(www, exportOf.get(name) || null, encoders);
  return {
    command: 'NODE_PATH=<scratch>/node_modules node bench/measure.js --layer tokens --nodes <name>=<www>,… --exports <name>=<dir>,…',
    no_claude_count: 'Anthropic publishes no offline tokenizer; no Claude token count is reported, because it would be a guess.',
    nodes: per,
    tokenizer: { library: 'gpt-tokenizer', licence: 'MIT', version, vocabularies: ['cl100k_base', 'o200k_base'] },
  };
}

async function layerA11y(nodes) {
  const a11y = require('./a11y.js');
  let versions;
  try {
    versions = { axe_core: require('axe-core/package.json').version, playwright_core: require('playwright-core/package.json').version };
  } catch {
    return { command: 'node bench/measure.js --layer a11y', status: 'not run', reason: 'playwright-core and axe-core are not resolvable (NODE_PATH)' };
  }
  if (!process.env.CHROME_EXE) return { command: 'node bench/measure.js --layer a11y', status: 'not run', reason: 'CHROME_EXE is not set' };
  const per = Object.create(null);
  for (const [name, www] of nodes) {
    const run = await a11y.runBrowser({ chrome: process.env.CHROME_EXE, www });
    const byType = a11y.tallyByType(run.results);
    per[name] = {
      by_type: byType,
      checks: run.results.length,
      pages: run.pages,
      third_party_requests: run.third_party,
      violations: Object.values(byType).reduce((acc, t) => acc + t.violations, 0),
      weights: a11y.pageWeights(www),
    };
  }
  return {
    ceiling: 'axe-core finds on average 57 % of WCAG issues automatically; zero violations is a floor, never a conformance claim.',
    command: 'NODE_PATH=<scratch>/node_modules CHROME_EXE=<chrome> node bench/measure.js --layer a11y --nodes <name>=<www>,…',
    nodes: per,
    schemes: ['light', 'dark'],
    tags: a11y.AXE_TAGS,
    versions,
  };
}

function layerRetrieval(nodes) {
  const per = Object.create(null);
  for (const [name, www] of nodes) {
    const r = timed(NODE, [path.join(REPO, 'tools', 'bench'), '--node', www, '--origin-node', name, '--json'], { cwd: REPO });
    const envelope = JSON.parse(r.out);
    // The record names the node, never the path it was built into on this machine.
    per[name] = { ...envelope, node: `<${name} build output>`, set: 'bench/queries/bench-v1' };
  }
  return { command: 'node tools/bench --node <built node> --origin-node <name> --json', nodes: per };
}

function layerPackage() {
  const r = timed('npm', ['pack', '--dry-run', '--json'], { cwd: REPO });
  const pack = JSON.parse(r.out)[0];
  return { command: 'npm pack --dry-run --json', files: pack.entryCount, packed_bytes: pack.size, unpacked_bytes: pack.unpackedSize };
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
    let html = null;
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
        // every chunk file, the shards included, summed.
        chunkBytes = fs.readdirSync(outDir).filter((f) => /^chunks(?:-\d+)?\.jsonl$/u.test(f))
          .reduce((acc, f) => acc + fs.statSync(path.join(outDir, f)).size, 0) || null;
        // the page budget of AGSC-06-21 is over `*.html` only.
        html = require('./a11y.js').pageWeights(outDir);
      }
    }
    rows.push({
      bytes_per_item_index: indexBytes === null ? null : Math.round(indexBytes / items),
      chunks_bytes: chunkBytes,
      chunks_bytes_per_item: chunkBytes === null ? null : Math.round(chunkBytes / items),
      files: tree.files,
      html_pages: html.pages,
      html_largest_bytes: html.largest ? html.largest.bytes : null,
      html_largest_path: html.largest ? html.largest.path : null,
      html_median_bytes: html.median_bytes,
      html_over_budget: html.over_budget.length,
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
  let nodes = [];
  let exportDirs = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { out(HELP); return 0; }
    else if (arg === '--layer') { i += 1; layer = argv[i]; }
    else if (arg === '--scratch') { i += 1; scratch = argv[i]; }
    else if (arg === '--out') { i += 1; target = argv[i]; }
    else if (arg === '--sizes') { i += 1; sizes = String(argv[i]).split(',').map(Number); }
    else if (arg === '--runs') { i += 1; runsPerSize = Number(argv[i]); }
    else if (arg === '--nodes') { i += 1; nodes = namedDirs(argv[i]); }
    else if (arg === '--exports') { i += 1; exportDirs = namedDirs(argv[i]); }
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

  const finish = (partial) => {
    fs.writeFileSync(partialPath(scratch, layer), `${JSON.stringify(partial, null, 2)}\n`);
    if (json) out(`${JSON.stringify(partial, null, 2)}\n`);
    else out(`measure: ${layer} written to ${partialPath(scratch, layer)}\n`);
    return 0;
  };
  if (layer === 'conformance') return finish(layerConformance());
  if (layer === 'determinism') return finish(layerDeterminism(scratch));
  if (layer === 'security') return finish(layerSecurity(scratch));
  if (layer === 'perf') return finish(layerPerf(scratch, sizes, runsPerSize));
  if (layer === 'tokens') return finish(layerTokens(nodes, exportDirs));
  if (layer === 'retrieval') return finish(layerRetrieval(nodes));
  if (layer === 'package') return finish(layerPackage());
  if (layer === 'parity') return layerParity(nodes).then(finish);
  return layerA11y(nodes).then(finish);
}

if (require.main === module) Promise.resolve(run(process.argv.slice(2))).then((code) => process.exit(code));

module.exports = { HELP, LAYERS, run };

/* c8 ignore stop */
