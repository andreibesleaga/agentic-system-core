'use strict';
// The `build` cases that read what a real build writes into `build.out`:
//
//   build-0020 (AGSC-00-05) a retired and a draft item, and what each surface carries;
//   build-0021 (AGSC-01-19) a `build.out` naming `content/` or `dist/` is refused and
//              nothing is written;
//   build-0022 (AGSC-01-20) the release switchboard holds an item back everywhere;
//   build-0023 (AGSC-05-07) the page copy drops a Link to a draft;
//   build-0024 (AGSC-06-01) the whole route set of the minimal fixture;
//   build-0025 (AGSC-07-19) the shape of `/skills/index.json`;
//   build-0026 (AGSC-07-20) the lock of each pack is the hash of its `SKILL.md`;
//   build-0027 (AGSC-06-18) the TDM reservation file and its robots groups;
//   build-0028 (AGSC-01-20) a release key the switchboard does not declare holds an
//              item back everywhere.
//
// Each run copies the named fixture to a scratch folder, writes `input.add_files` (and a
// sub-case's own) over it, and runs the whole command line with the file-system port
// alone: no ProcessRunner, so no git history (`input.git_history: false`), and exactly
// the environment the case states, with the vector's SOURCE_DATE_EPOCH. A route ending
// in `/` is served as its `index.html`.

const path = require('node:path');
const nodeFs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { main } = require('../../../src/application/cli/main.js');
const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { canonicalize } = require('../../../src/knowledge/jcs.js');
const { captureStream } = require('./_shared.js');
const { checks, deepEqual, findingsMatch } = require('./_assert.js');

/** `JSON.parse(text)`, or `fallback` where the text is not JSON. */
function parseOr(text, fallback) {
  try { return JSON.parse(text); } catch (e) { return fallback; }
}

/** Every file under `dir`, as `/`-separated paths relative to it. */
function walk(dir, prefix = '') {
  const out = [];
  if (!nodeFs.existsSync(path.join(dir, prefix))) return out;
  for (const entry of nodeFs.readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(dir, rel));
    else out.push(rel);
  }
  return out.sort();
}

/** The file a route is served from: a route ending in `/` is its `index.html`. */
const fileOf = (route) => (route.endsWith('/') ? `${route}index.html` : route);

/**
 * Run `argv` over a scratch copy of `input.bundle` with the files of the case and of the
 * sub-case written over it; `inspect` sees the result before the folder is removed.
 * `files` maps each route under `build.out` (from the configuration, `www` by default)
 * to its bytes; `written` lists every file the run added anywhere in the Bundle.
 */
function onBuild(vector, ctx, sub, inspect) {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), `agsc-${vector.id}-`));
  try {
    nodeFs.cpSync(path.join((ctx && ctx.root) || '.', 'tests', String(vector.input.bundle)), root, { recursive: true });
    const adds = { ...(vector.input.add_files || {}), ...((sub && sub.add_files) || {}) };
    for (const [file, text] of Object.entries(adds)) {
      nodeFs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      nodeFs.writeFileSync(path.join(root, file), text);
    }
    const before = new Set(walk(root));
    const epoch = String((vector.options || {}).source_date_epoch);
    const run = (argv) => {
      const stdout = captureStream();
      const stderr = captureStream();
      const exit = main(argv, {
        env: { SOURCE_DATE_EPOCH: epoch, ...((sub && sub.environment) || {}) },
        ports: { fs: createFileSystem(root) },
        root,
        specVersion: (vector.options || {}).spec_version,
        stderr,
        stdout,
        version: (vector.options || {}).spec_version,
      });
      const envelope = parseOr(stdout.text(), null);
      return { envelope, exit, findings: (envelope && envelope.findings) || [] };
    };
    const argv = (sub && sub.argv) || vector.input.argv || ['build', '--json'];
    const result = run(argv);
    let out = 'www';
    try {
      const config = JSON.parse(nodeFs.readFileSync(path.join(root, 'agsc.config.json'), 'utf8'));
      out = String((config.build && config.build.out) || 'www').replace(/\/+$/u, '');
    } catch (e) { out = 'www'; }
    const files = new Map();
    for (const rel of walk(path.join(root, out))) files.set(`/${rel}`, nodeFs.readFileSync(path.join(root, out, rel)));
    const written = walk(root).filter((rel) => !before.has(rel));
    const read = (rel) => (nodeFs.existsSync(path.join(root, rel)) ? nodeFs.readFileSync(path.join(root, rel), 'utf8') : null);
    return inspect({ ...result, files, read, rerun: () => run(argv), written });
  } finally {
    nodeFs.rmSync(root, { force: true, recursive: true });
  }
}

const text = (files, route) => (files.has(fileOf(route)) ? files.get(fileOf(route)).toString('utf8') : null);

/** The checks every case of this file may state over one build: members it carries are read. */
function surfaceChecks(expected, run) {
  const list = [];
  const { files } = run;
  if (expected.no_error_finding !== undefined) {
    const errors = run.findings.filter((f) => f.severity === 'error');
    list.push(['no error finding', (errors.length === 0) === expected.no_error_finding && run.exit === 0,
      `exit ${run.exit} ${JSON.stringify(errors.map((f) => f.code))}`]);
  }
  for (const route of expected.routes_present || []) list.push([`emits ${route}`, files.has(fileOf(route)), route]);
  for (const route of expected.routes_absent || []) list.push([`no ${route}`, !files.has(fileOf(route)), route]);
  for (const [route, strings] of Object.entries(expected.carried_by || {})) {
    const body = text(files, route);
    for (const s of strings) list.push([`${route} carries ${s}`, body !== null && body.includes(s), `${route} ${body === null ? 'absent' : 'present'}`]);
  }
  for (const [route, strings] of Object.entries(expected.not_carried_by || {})) {
    const body = text(files, route);
    for (const s of strings) list.push([`${route} omits ${s}`, body !== null && !body.includes(s), `${route} ${body === null ? 'absent' : 'names it'}`]);
  }
  for (const [route, strings] of Object.entries(expected.files_contain || {})) {
    const body = text(files, route);
    for (const s of strings) list.push([`${route} contains ${s}`, body !== null && body.includes(s), String(body).slice(0, 400)]);
  }
  for (const s of expected.in_no_file || []) {
    const hits = [...files.entries()].filter(([route, bytes]) => route.includes(s) || bytes.toString('latin1').includes(s))
      .map(([route]) => route);
    list.push([`no file names ${s}`, hits.length === 0, JSON.stringify(hits)]);
  }
  for (const [route, bytes] of Object.entries(expected.route_bytes || {})) {
    const body = text(files, route);
    list.push([`${route} bytes`, body === bytes, JSON.stringify(body)]);
  }
  return list;
}

/** build-0020, build-0022, build-0023, build-0028: one build, the surface checks. */
function surfacesCase(vector, ctx) {
  return onBuild(vector, ctx, null, (run) => checks(surfaceChecks(vector.expected, run)));
}

/** build-0021 (AGSC-01-19): each sub-case's exit, findings and what it wrote. */
function buildOutCase(vector, ctx) {
  const list = [];
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  for (const sub of vector.input.cases || []) {
    const want = byName.get(sub.name);
    if (want === undefined) { list.push([sub.name, false, 'the vector states no expected case of this name']); continue; }
    onBuild(vector, ctx, sub, (run) => {
      if (want.exit !== undefined) list.push([`${sub.name} exit`, run.exit === want.exit, `exit ${run.exit}`]);
      if (want.exit_one_of !== undefined) list.push([`${sub.name} exit`, want.exit_one_of.includes(run.exit), `exit ${run.exit}`]);
      if (want.findings !== undefined) {
        const m = findingsMatch(want.findings, run.findings);
        list.push([`${sub.name} findings`, m.ok, `${m.detail} ${JSON.stringify(run.findings.map((f) => f.code))}`]);
      }
      for (const code of want.codes_absent || []) {
        list.push([`${sub.name} no ${code}`, !run.findings.some((f) => f.code === code), JSON.stringify(run.findings)]);
      }
      if (want.nothing_written !== undefined) {
        list.push([`${sub.name} nothing written`, (run.written.length === 0) === want.nothing_written, JSON.stringify(run.written)]);
      }
      if (want.written_only_under !== undefined) {
        const outside = run.written.filter((rel) => !rel.startsWith(want.written_only_under));
        list.push([`${sub.name} writes only under ${want.written_only_under}`, run.written.length > 0 && outside.length === 0,
          JSON.stringify(outside)]);
      }
    });
  }
  return checks(list);
}

/** The same-origin `.js`/`.css` files the emitted HTML pages load (script src, stylesheet href). */
function pageAssets(files) {
  const loaded = new Set();
  for (const [route, bytes] of files) {
    if (!route.endsWith('.html')) continue;
    const dir = route.slice(0, route.lastIndexOf('/') + 1);
    const html = bytes.toString('utf8');
    const refs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gu), ...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/gu)];
    for (const [, ref] of refs) {
      if (/^[a-z][a-z0-9+.-]*:|^\/\//iu.test(ref)) continue; // another origin: never a file of this build
      loaded.add(ref.startsWith('/') ? ref : path.posix.normalize(`${dir}${ref}`));
    }
  }
  return loaded;
}

/** build-0024 (AGSC-06-01): the route set, exactly, and the page assets beside it. */
function routeSetCase(vector, ctx) {
  return onBuild(vector, ctx, null, (run) => {
    const expected = vector.expected;
    const routeOf = (file) => (file.endsWith('/index.html') ? file.slice(0, -'index.html'.length) : file);
    const loaded = pageAssets(run.files);
    const assets = [...run.files.keys()].filter((f) => /\.(js|css)$/u.test(f) && loaded.has(f));
    const routes = [...run.files.keys()].filter((f) => !assets.includes(f)).map(routeOf).sort();
    const list = surfaceChecks(expected, run);
    const want = [...expected.routes].sort();
    list.push(['the route set', deepEqual(routes, want),
      `extra ${JSON.stringify(routes.filter((r) => !want.includes(r)))} missing ${JSON.stringify(want.filter((r) => !routes.includes(r)))}`]);
    for (const asset of expected.page_assets_required) list.push([`emits ${asset}`, assets.includes(asset), JSON.stringify(assets)]);
    list.push(['other files are page assets', expected.other_files_are_page_assets === true
      && assets.every((a) => a.endsWith('.js') || a.endsWith('.css')), JSON.stringify(assets)]);
    list.push(['deployment profile', vector.input.deployment_profile === 'cloudflare-pages',
      'this writer emits the Cloudflare Pages profile (AGSC-06-17)']);
    return checks(list);
  });
}

const isJcsWithOneLf = (bytes) => {
  if (bytes === null || !bytes.endsWith('\n') || bytes.endsWith('\n\n')) return false;
  try { return `${canonicalize(JSON.parse(bytes))}\n` === bytes; } catch (e) { return false; }
};

/** build-0025 (AGSC-07-19): the members and values of `/skills/index.json`, per sub-case. */
function skillsIndexCase(vector, ctx) {
  const list = [];
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  for (const sub of vector.input.cases || []) {
    const want = byName.get(sub.name);
    if (want === undefined) { list.push([sub.name, false, 'the vector states no expected case of this name']); continue; }
    onBuild(vector, ctx, sub, (run) => {
      const bytes = text(run.files, '/skills/index.json');
      list.push([`${sub.name} JCS and one LF`, isJcsWithOneLf(bytes) === want.jcs_with_one_lf, JSON.stringify(bytes)]);
      const index = parseOr(bytes, null) || {};
      list.push([`${sub.name} members`, deepEqual(Object.keys(index).sort(), [...want.members].sort()), JSON.stringify(Object.keys(index))]);
      for (const key of ['bundle_version', 'license', 'spec_version', 'terms']) {
        list.push([`${sub.name} ${key}`, index[key] === want[key], JSON.stringify(index[key])]);
      }
      const packs = Array.isArray(index.packs) ? index.packs : [];
      list.push([`${sub.name} packs`, packs.length === want.packs.length, JSON.stringify(packs)]);
      want.packs.forEach((pack, i) => {
        const got = packs[i] || {};
        list.push([`${sub.name} pack ${i} members`, deepEqual(Object.keys(got).sort(), [...want.pack_members].sort()), JSON.stringify(Object.keys(got))]);
        const { lock, ...rest } = got; // the lock is build-0026's subject
        list.push([`${sub.name} pack ${i}`, deepEqual(rest, pack), JSON.stringify(rest)]);
        list.push([`${sub.name} pack ${i} has a lock`, lock !== undefined, JSON.stringify(got)]);
      });
    });
  }
  return checks(list);
}

/** build-0026 (AGSC-07-20): every pack's lock is the SHA-256 of the SKILL.md the build serves. */
function skillsLockCase(vector, ctx) {
  return onBuild(vector, ctx, null, (run) => {
    const expected = vector.expected;
    const index = parseOr(text(run.files, '/skills/index.json'), null) || {};
    const packs = Array.isArray(index.packs) ? index.packs : [];
    const list = [['packs_count', packs.length === expected.packs_count, `${packs.length}`]];
    for (const pack of packs) {
      const lock = pack.lock || {};
      list.push([`${pack.name} lock members`, deepEqual(Object.keys(lock).sort(), [...expected.lock_members].sort()), JSON.stringify(lock)]);
      const served = run.files.get(String(pack.path));
      const digest = served === undefined ? null : crypto.createHash('sha256').update(served).digest('hex');
      const ok = /^[0-9a-f]{64}$/u.test(String(lock['SKILL.md'])) && lock['SKILL.md'] === digest;
      list.push([`${pack.name} lock is the hash of ${pack.path}`, ok === expected.lock_is_sha256_of_skill_md,
        `lock ${lock['SKILL.md']} served ${digest}`]);
    }
    const lockRoutes = [...run.files.keys()].filter((r) => /\.lock$|lock(file)?\.json$/iu.test(r));
    list.push(['no lock route', (lockRoutes.length === 0) === expected.no_lock_route, JSON.stringify(lockRoutes)]);
    return checks(list);
  });
}

/**
 * A TDMRep location pattern against a path: a prefix match in which `*` stands for any
 * characters and a final `$` ends the pattern (TDM Reservation Protocol, section 6.1).
 */
function tdmMatches(pattern, target) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, '\\$&')).join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`, 'u').test(target);
}

/** The user agents of the robots.txt groups that carry `Disallow: /`, in file order. */
function disallowAllGroups(robots) {
  const out = [];
  let agents = [];
  let inRules = false;
  for (const raw of String(robots || '').split('\n')) {
    const line = raw.replace(/#.*$/u, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/u.exec(line);
    if (m === null) continue;
    const field = m[1].toLowerCase();
    if (field === 'user-agent') {
      if (inRules) { agents = []; inRules = false; }
      agents.push(m[2]);
    } else if (field === 'allow' || field === 'disallow') {
      inRules = true;
      if (field === 'disallow' && m[2] === '/') out.push(...agents.filter((a) => !out.includes(a)));
    }
  }
  return out;
}

/** build-0027 (AGSC-06-18): the reservation each path gets, the file form and the robots groups. */
function tdmrepCase(vector, ctx) {
  const list = [];
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  for (const sub of vector.input.cases || []) {
    const want = byName.get(sub.name);
    if (want === undefined) { list.push([sub.name, false, 'the vector states no expected case of this name']); continue; }
    onBuild(vector, ctx, sub, (run) => {
      const bytes = text(run.files, '/.well-known/tdmrep.json');
      list.push([`${sub.name} JCS and one LF`, isJcsWithOneLf(bytes) === want.jcs_with_one_lf, JSON.stringify(bytes)]);
      const rules = parseOr(bytes, []);
      for (const [target, reservation] of Object.entries(want.reservation_for_paths)) {
        const rule = (Array.isArray(rules) ? rules : []).find((r) => r && typeof r.location === 'string' && tdmMatches(r.location, target));
        const got = rule === undefined ? null : rule['tdm-reservation'];
        list.push([`${sub.name} ${target}`, got === reservation, `got ${JSON.stringify(got)}`]);
      }
      for (const route of want.routes_absent) list.push([`${sub.name} no ${route}`, !run.files.has(route), route]);
      const groups = disallowAllGroups(text(run.files, '/robots.txt'));
      list.push([`${sub.name} robots groups`, deepEqual(groups, want.robots_disallow_all_groups), JSON.stringify(groups)]);
    });
  }
  return checks(list);
}

const HANDLERS = Object.freeze({
  'build-0020': surfacesCase,
  'build-0021': buildOutCase,
  'build-0022': surfacesCase,
  'build-0023': surfacesCase,
  'build-0024': routeSetCase,
  'build-0025': skillsIndexCase,
  'build-0026': skillsLockCase,
  'build-0027': tdmrepCase,
  'build-0028': surfacesCase,
});

module.exports = { HANDLERS, disallowAllGroups, isJcsWithOneLf, onBuild, pageAssets, parseOr, tdmMatches };
