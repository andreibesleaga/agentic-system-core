'use strict';
/**
 * src/application/hosting.js — `agsc-host`: put a built node on a host.
 *
 * A Bundle is a file set and so is its build; a node can therefore live anywhere that
 * serves a directory over HTTPS, and on hosts that cannot set headers only with a
 * web interface in front (`spec/10-implementation-profiles.md`, the informative
 * paragraph "Where a node can live"). This module is the command that does it:
 *
 *   agsc-host list                               the hosting profiles, their claims and limits
 *   agsc-host emit <profile> [--site d] [--out d] one profile's host configuration
 *   agsc-host serve [--site d] [--port n] [--bind h]   the node from its own machine
 *   agsc-host verify-anchor <anchor.json> [--site d]   is this build the anchored one?
 *
 * It is a command of its own and not a verb of `agsc`, because AGSC-09-07 closes the
 * `agsc` verb set at sixteen and makes any other verb `AGSC-E001`.
 *
 * APPLICATION LAYER: it reads the build directory, writes files and resolves plugins —
 * the host wiring no bounded context may do; the socket belongs to the HTTP server
 * adapter (`src/adapters/node-http-server.js`). The profiles themselves are data-in,
 * data-out (`distribution/hosts/`). A profile is a plugin of the `deployment-profile` kind (AGSC-00-24): the built-in ones pass the same
 * capability check as one named by a path or an installed package, which is loaded
 * through the plugin loader and never from the network (`AGSC-E905`).
 *
 * What a profile may write is checked here, not trusted: `site` files go into the
 * build directory and may not replace a route (a host-configuration file such as
 * the reference `_headers` or `_redirects` is not a route and may be replaced),
 * `server` files go under
 * `--out`, and every path is relative with no `..` (`AGSC-E902`). A run with an
 * error finding writes nothing.
 *
 * The build directory is `--site` when given — the user's choice — and otherwise
 * `build.out` resolved through every layer of the configuration (AGSC-01-37) and held
 * to AGSC-01-19 and AGSC-01-35 as `agsc` holds it: a value the Bundle's configuration
 * points outside the Bundle root is refused before anything is read, written or
 * served.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { parseArgs } = require('node:util');

const plugins = require('./plugins.js');
const pluginLoader = require('./plugin-loader.js');
const builtins = require('../distribution/hosts/index.js');
const rules = require('../distribution/hosts/rules.js');
const local = require('../distribution/hosts/local.js');
const anchor = require('../distribution/hosts/ledger-anchor.js');
const { WELLKNOWN_PATH } = require('../distribution/discovery.js');
const { canonicalize } = require('../knowledge/jcs.js');
const { buildOutFault, finding } = require('../knowledge/validate.js');
const { pathGrammarError } = require('../knowledge/links.js');
const { load } = require('./config/load.js');
const configNames = require('./config/env.js');
const httpServer = require('../adapters/node-http-server.js');
const { createFileSystem } = require('../adapters/node-fs.js');

const { inside } = httpServer;

const COMMANDS = Object.freeze(['list', 'emit', 'serve', 'verify-anchor']);

const USAGE = [
  'usage: agsc-host <command> [options]',
  '  list                                   the hosting profiles, what each claims and its limits',
  '  emit <profile|path|package>            write one profile\'s host configuration',
  '       [--site <build dir>] [--out <dir>]    (default: build.out of agsc.config.json, dist/hosts/<profile>)',
  '  serve [--site <build dir>] [--port <n>] [--bind <host>]',
  '                                         serve the build read-only (default localhost:8080)',
  '  verify-anchor <anchor.json> [--site <build dir>]',
  '                                         check that the build is the one the anchor names',
  'every command takes --json',
].join('\n');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * The built-in profiles, each admitted by the registry of its kind.
 * @param {string} specVersion
 */
function registry(specVersion) {
  const reg = plugins.createRegistry('deployment-profile', { specVersion });
  const findings = [];
  for (const profile of builtins) findings.push(...reg.register(profile).findings);
  return { findings, registry: reg };
}

/**
 * A built-in profile by name, or a plugin named by a path or an installed package.
 * @returns {{profile:(object|null), findings:Array<object>}}
 */
function resolveProfile(name, options) {
  const { registry: reg, findings } = registry(options.specVersion);
  if (findings.length > 0) return { findings, profile: null };
  const own = reg.get(name);
  if (own !== undefined) return { findings: [], profile: own };
  // A remote specifier is `AGSC-E905` and a malformed one `AGSC-E004`, both from the
  // loader; only a package name that nothing installed answers is "unknown".
  const tried = loaded(name, options);
  if (!tried.missing) return tried;
  return {
    findings: [finding('AGSC-E203', `"${name}" is not a hosting profile (${reg.names().join(', ')}),`
      + ' a path to one, or an installed package', { file: '' })],
    profile: null,
  };
}

function loaded(name, options) {
  const result = pluginLoader.load('deployment-profile', name, {
    flag: 'agsc-host emit', root: options.root, specVersion: options.specVersion,
  });
  return { findings: result.findings, missing: result.missing, profile: result.plugin };
}

/**
 * The build directory as a profile's input: every regular file with its size and
 * SHA-256, the parsed reference configuration and the discovery document. A link is
 * reported and not followed.
 */
function readSite(dir) {
  const findings = [];
  const files = [];
  const walk = (rel) => {
    const entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        findings.push(finding('AGSC-E902', `${child} is a link; a hosting profile reads the build's own files only`, { file: child }));
      } else if (entry.isDirectory()) {
        walk(child);
      } else if (entry.isFile()) {
        const bytes = fs.readFileSync(path.join(dir, child));
        files.push({ path: child, sha256: sha256(bytes), size: bytes.length });
      }
    }
  };
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return { findings: [finding('AGSC-E901', `the build directory ${dir} does not exist; run agsc build first`, { file: dir })], input: null };
  }
  walk('');
  const text = (rel) => (files.some((f) => f.path === rel) ? fs.readFileSync(path.join(dir, rel), 'utf8') : null);
  const headersText = text(rules.HEADERS_FILE);
  const redirectsText = text(rules.REDIRECTS_FILE);
  const parsedHeaders = rules.parseHeaders(headersText);
  const parsedRedirects = rules.parseRedirects(redirectsText);
  findings.push(...parsedHeaders.findings, ...parsedRedirects.findings);
  return {
    findings,
    input: {
      discoveryText: text(WELLKNOWN_PATH.slice(1)),
      files,
      hasHeadersFile: headersText !== null,
      hasRedirectsFile: redirectsText !== null,
      redirects: parsedRedirects.rules,
      sets: parsedHeaders.sets,
    },
  };
}

/** One list of `{path, text}` a profile answered, checked; findings for every fault. */
function checkedFiles(list, label) {
  const findings = [];
  if (list === undefined) return { files: [], findings };
  if (!Array.isArray(list)) {
    return { files: [], findings: [finding('AGSC-E004', `the profile's ${label} answer is not a list of {path, text}`, { file: '' })] };
  }
  for (const f of list) {
    if (!f || typeof f.path !== 'string' || typeof f.text !== 'string') {
      findings.push(finding('AGSC-E004', `the profile's ${label} answer holds an entry that is not {path, text}`, { file: '' }));
      continue;
    }
    const reason = pluginLoader.unsafePath(f.path);
    if (reason !== null) findings.push(finding('AGSC-E902', `${label} file "${f.path}" is ${reason}`, { file: f.path }));
  }
  return { files: findings.length === 0 ? list.map((f) => ({ path: f.path, text: f.text })) : [], findings };
}

/**
 * Run one profile over a build's input: its answer, checked. A `deployment-profile`
 * plugin answers `emit(input)` → `{site, server, findings}`; one that offers only the
 * older single-file hook `headerFile(sets)` is given the header sets and its file is a
 * server file.
 */
function runProfile(profile, input) {
  const frozen = pluginLoader.detached(input);
  const label = `agsc-host emit ${profile.name}`;
  let answer;
  if (typeof profile.emit !== 'function' && typeof profile.headerFile === 'function') {
    const one = pluginLoader.call(profile, 'headerFile', [frozen.sets], label);
    answer = one.value === null ? one : { findings: [], value: { server: [one.value] } };
  } else {
    answer = pluginLoader.call(profile, 'emit', [frozen], label);
  }
  const value = answer.value || {};
  const own = pluginLoader.pluginFindings(value);
  const site = checkedFiles(value.site, 'site');
  const server = checkedFiles(value.server, 'server');
  const findings = [...answer.findings, ...own, ...site.findings, ...server.findings];
  const routes = new Set(input.files.map((f) => f.path));
  for (const f of site.files) {
    if (routes.has(f.path) && !rules.CONFIG_FILES.includes(f.path)) {
      findings.push(finding('AGSC-E004', `the profile would replace ${f.path}, a file of the route set;`
        + ' a deployment profile never changes a route or a served byte (AGSC-00-24)', { file: f.path }));
    }
  }
  return { findings, server: server.files, site: site.files };
}

const throughLink = (rel) => Object.assign(new Error(`${rel} would be written through a link`), { code: 'AGSC-E902' });

/** The nearest path at or above `dir` that exists, a link included (it is not followed). */
function nearestExisting(dir) {
  let probe = dir;
  while (fs.lstatSync(probe, { throwIfNoEntry: false }) === undefined) {
    const parent = path.dirname(probe);
    if (parent === probe) return probe;
    probe = parent;
  }
  return probe;
}

/**
 * Write the text files of every group `{root, files, fence}` under its `root`, never
 * through a link out of `fence` (the folder the files must stay in). Every file is
 * checked before any folder is made or any file written: the nearest part of its
 * folder that exists must lie inside `fence` once links are resolved — or above a
 * `fence` not made yet, where nothing exists to pass through. The check is made again
 * after the folders are made, and a file that is itself a link is never written.
 * @param {Array<{root:string, files:Array<{path:string, text:string}>, fence:string}>} groups
 * @returns {Array<string>} the files written
 */
function writeUnder(groups) {
  const plan = [];
  for (const { root, files, fence } of groups) {
    for (const f of files) {
      const full = path.join(root, ...f.path.split('/'));
      const existing = nearestExisting(path.dirname(full));
      if ((existing === fence || existing.startsWith(fence + path.sep)) && !inside(fence, existing)) throw throughLink(f.path);
      plan.push({ fence, full, rel: f.path, text: f.text });
    }
  }
  for (const { fence, full, rel, text } of plan) {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (!inside(fence, path.dirname(full)) || (fs.existsSync(full) && fs.lstatSync(full).isSymbolicLink())) throw throughLink(rel);
    fs.writeFileSync(full, text, 'utf8');
  }
  return plan.map((p) => p.full);
}

/** The grammar `agsc.config.json` gives `build.out` (`schema/config.schema.json`). */
const OUT_GRAMMAR = new RegExp(configNames.pathForEnvName('AGSC_BUILD_OUT').pattern, 'u');

/**
 * Why a resolved `build.out` value is refused, as findings: outside the grammar of
 * AGSC-01-19 (`AGSC-E204`), a `.` or `..` segment, a leading `/` or an empty one, or
 * a path that resolves outside the Bundle root such as a drive path on Windows
 * (AGSC-01-35, `AGSC-E902`), or naming `content/` or `dist/` (AGSC-01-19, `AGSC-E204`).
 */
function outFaults(out, cwd) {
  const where = { file: 'agsc.config.json' };
  if (typeof out !== 'string') return [finding('AGSC-E204', 'build.out is not a string; it names the build directory (AGSC-01-19)', where)];
  const findings = [];
  if (!OUT_GRAMMAR.test(out)) {
    findings.push(finding('AGSC-E204', `build.out "${out}" does not match the grammar of build.out (${OUT_GRAMMAR.source}) (AGSC-01-19)`, where));
  }
  const value = out.replace(/\/$/u, '');
  const root = path.resolve(cwd);
  const resolved = path.resolve(root, value);
  const reason = pathGrammarError(value) || (resolved.startsWith(root + path.sep) ? null : 'escapes the Bundle root');
  if (reason !== null) {
    findings.push(finding('AGSC-E902', `build.out "${out}" violates the path grammar (${reason}); the build directory lies inside the Bundle root (AGSC-01-35)`, where));
  }
  const named = buildOutFault(value);
  if (named !== null) findings.push(finding('AGSC-E204', named, where));
  return findings;
}

/**
 * The build directory named by the configuration when no `--site` is given:
 * `build.out` through every layer (the project file, the `.env` file, the process
 * environment; AGSC-01-37), `www` by default (AGSC-01-19), with the findings that
 * refuse it. A configuration file that does not parse leaves the default (`lint`
 * reports it).
 * @param {string} cwd the Bundle root
 * @param {object} [env] a snapshot of the process environment
 * @returns {{out:(string|null), findings:Array<object>}}
 */
function defaultSite(cwd, env) {
  let loaded;
  try {
    loaded = load({ env: env || {}, ports: createFileSystem(cwd), root: cwd });
  } catch (e) {
    const code = /^AGSC-E9\d\d$/u.test(String(e && e.code)) ? e.code : 'AGSC-E901';
    return { findings: [finding(code, `the configuration cannot be read: ${e && e.message}`, { file: (e && e.file) || '' })], out: null };
  }
  const layered = loaded.findings.filter((f) => f.path === 'build.out').map((f) => finding(f.code, f.message, { file: '' }));
  if (layered.length > 0) return { findings: layered, out: null };
  const out = loaded.config.build.out;
  const findings = outFaults(out, cwd);
  return findings.length > 0 ? { findings, out: null } : { findings, out: out.replace(/\/$/u, '') };
}

/**
 * The build directory a command reads: `--site` as given, or the configured one,
 * which must also stay inside the Bundle root once links are resolved (AGSC-01-35).
 * @returns {{site:(string|null), findings:Array<object>}}
 */
function siteOf(values, ctx) {
  if (values.site) return { findings: [], site: path.resolve(ctx.cwd, values.site) };
  const { out, findings } = defaultSite(ctx.cwd, ctx.env);
  if (out === null) return { findings, site: null };
  const site = path.resolve(ctx.cwd, out);
  if (fs.existsSync(site) && !inside(ctx.cwd, site)) {
    return { findings: [finding('AGSC-E902', `build.out "${out}" reaches outside the Bundle root through a link (AGSC-01-35)`, { file: 'agsc.config.json' })], site: null };
  }
  return { findings: [], site };
}

/**
 * Serve a build directory, read-only, through the HTTP server adapter; what each
 * request is answered with is the `local` profile's decision. Resolves once listening.
 * @param {{site:string, port?:number, bind?:string}} options
 * @returns {Promise<{server:object, url:string}>}
 */
function serve(options) {
  // The names it answers to: the loopback names and the `--bind` value, then the
  // address the socket reports once it listens (`local.hostNames`).
  let hosts = local.hostNames(options.bind);
  const answer = (question, view) => local.respond(question, {
    ...view,
    hosts,
    redirects: rules.parseRedirects(view.readText(rules.REDIRECTS_FILE)).rules,
    sets: rules.parseHeaders(view.readText(rules.HEADERS_FILE)).sets,
  });
  return httpServer.listen({ ...options, answer }).then((running) => {
    hosts = local.hostNames(options.bind, new URL(running.url).hostname);
    return running;
  });
}

// ------------------------------------------------------------------ the command line

function report(io, json, result) {
  const errors = result.findings.filter((f) => f.severity === 'error').length;
  const status = errors > 0 ? 'fail' : 'pass';
  if (json) {
    io.stdout.write(`${canonicalize({ command: result.command, findings: result.findings, status, ...result.extra })}\n`);
  } else {
    for (const f of result.findings) io.stderr.write(`${f.code} ${f.severity}: ${f.file ? `${f.file}: ` : ''}${f.message}\n`);
    for (const line of result.lines || []) io.stdout.write(`${line}\n`);
    io.stderr.write(`agsc-host ${result.command}: ${status} (${errors} error, ${result.findings.length - errors} warn)\n`);
  }
  return errors > 0 ? 1 : 0;
}

function usageError(io, json, code, message) {
  const f = finding(code, message, { file: '' });
  if (json) io.stderr.write(`${canonicalize(f)}\n`);
  else io.stderr.write(`agsc-host: ${code} ${message}\n${USAGE}\n`);
  return 2;
}

function list(io, json, specVersion) {
  const { registry: reg, findings } = registry(specVersion);
  const profiles = reg.entries().map((p) => ({ claim: p.claim, limits: [...p.limits], name: p.name, title: p.title }));
  const lines = [];
  for (const p of profiles) {
    lines.push(`${p.name} — ${p.title}`, `  claim: ${p.claim}`, ...p.limits.map((l) => `  limit: ${l}`));
  }
  lines.push('solid — a Solid pod holding a copy of the Bundle is a declared surface (AGSC-11-21), declaration-only at 1.0: no host configuration to emit');
  return report(io, json, { command: 'list', extra: { profiles }, findings, lines });
}

function emitCommand(io, json, values, positionals, ctx) {
  const name = positionals[0];
  if (name === undefined) return usageError(io, json, 'AGSC-E003', 'emit needs a profile name, a path or a package');
  const { site, findings: configured } = siteOf(values, ctx);
  if (site === null) return report(io, json, { command: 'emit', findings: configured });
  const resolved = resolveProfile(name, { root: ctx.cwd, specVersion: ctx.specVersion });
  if (resolved.profile === null) return report(io, json, { command: 'emit', findings: resolved.findings });
  const profile = resolved.profile;
  const { input, findings: read } = readSite(site);
  if (input === null) return report(io, json, { command: 'emit', findings: read });
  const answer = runProfile(profile, input);
  const findings = [...read, ...answer.findings];
  const out = path.resolve(ctx.cwd, values.out || path.join('dist', 'hosts', profile.name));
  let written = [];
  if (!findings.some((f) => f.severity === 'error')) {
    try {
      // The default `--out` is the engine's choice and stays inside the Bundle; an
      // explicit one is the user's, as `--site` is.
      written = writeUnder([{ files: answer.site, fence: site, root: site },
        { files: answer.server, fence: values.out ? out : path.resolve(ctx.cwd), root: out }]);
    } catch (e) {
      findings.push(finding(e.code === 'AGSC-E902' ? 'AGSC-E902' : 'AGSC-E901', String(e.message), { file: '' }));
    }
  }
  const rel = written.map((w) => path.relative(ctx.cwd, w).split(path.sep).join('/'));
  return report(io, json, {
    command: 'emit',
    extra: { claim: String(profile.claim === undefined ? profile.name : profile.claim), profile: String(profile.name), written: rel },
    findings,
    lines: [...rel.map((r) => `wrote ${r}`), `claim: deployment profile ${profile.name}`],
  });
}

function verifyAnchorCommand(io, json, values, positionals, ctx) {
  const file = positionals[0];
  if (file === undefined) return usageError(io, json, 'AGSC-E003', 'verify-anchor needs the anchor file');
  let text;
  try {
    text = fs.readFileSync(path.resolve(ctx.cwd, file), 'utf8');
  } catch (e) {
    return report(io, json, { command: 'verify-anchor', findings: [finding('AGSC-E901', `cannot read ${file}`, { file })] });
  }
  const { site, findings: configured } = siteOf(values, ctx);
  if (site === null) return report(io, json, { command: 'verify-anchor', findings: configured });
  const { input, findings: read } = readSite(site);
  if (input === null) return report(io, json, { command: 'verify-anchor', findings: read });
  const findings = anchor.verify(text, input);
  return report(io, json, {
    command: 'verify-anchor',
    findings,
    lines: findings.length === 0 ? ['the build is the one the anchor names'] : [],
  });
}

async function serveCommand(io, json, values, ctx) {
  const port = values.port === undefined ? 8080 : Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return usageError(io, json, 'AGSC-E003', '--port needs a number from 0 to 65535');
  }
  const { site, findings: configured } = siteOf(values, ctx);
  if (site === null) return report(io, json, { command: 'serve', findings: configured });
  if (!fs.existsSync(site) || !fs.statSync(site).isDirectory()) {
    return report(io, json, { command: 'serve', findings: [finding('AGSC-E901', `the build directory ${site} does not exist; run agsc build first`, { file: site })] });
  }
  let running;
  try {
    running = await serve({ bind: values.bind, port, site });
  } catch (e) {
    return report(io, json, { command: 'serve', findings: [finding('AGSC-E901', `cannot listen: ${e.message}`, { file: '' })] });
  }
  if (typeof ctx.onListening === 'function') ctx.onListening(running.server);
  const lines = [`serving ${site} at ${running.url} — read-only; stop with Ctrl-C`];
  if (!/^(localhost|127\.|\[::1\])/u.test(running.url.slice('http://'.length))) {
    lines.push('this is not a loopback address: put a TLS terminator in front, conformance is claimed for an HTTPS origin;'
      + ' it answers only a Host that names localhost, a loopback address or this address');
  }
  return report(io, json, { command: 'serve', extra: { url: running.url }, findings: [], lines });
}

/**
 * The command line. Exit codes follow AGSC-09-08: 0 success, 1 findings, 2 usage.
 * @param {Array<string>} argv
 * @param {{stdout, stderr, cwd:string, specVersion:string, env?:object, onListening?:Function}} ctx
 *   `env` a snapshot of the process environment, for the `AGSC_*` layer of the
 *   configuration (never read from `process.env` here).
 * @returns {Promise<number>}
 */
async function main(argv, ctx) {
  const io = { stderr: ctx.stderr, stdout: ctx.stdout };
  const json = argv.includes('--json');
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      args: argv,
      options: {
        bind: { type: 'string' },
        help: { short: 'h', type: 'boolean' },
        json: { type: 'boolean' },
        out: { type: 'string' },
        port: { type: 'string' },
        site: { type: 'string' },
      },
      strict: true,
    });
  } catch (e) {
    return usageError(io, json, e.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' ? 'AGSC-E003' : 'AGSC-E002', e.message);
  }
  const [command, ...rest] = parsed.positionals;
  if (parsed.values.help || command === undefined) {
    io.stdout.write(`${USAGE}\n`);
    return command === undefined && !parsed.values.help ? 2 : 0;
  }
  if (!COMMANDS.includes(command)) return usageError(io, json, 'AGSC-E001', `unknown command "${command}" (${COMMANDS.join(', ')})`);
  if (command === 'list') return list(io, json, ctx.specVersion);
  if (command === 'emit') return emitCommand(io, json, parsed.values, rest, ctx);
  if (command === 'verify-anchor') return verifyAnchorCommand(io, json, parsed.values, rest, ctx);
  return serveCommand(io, json, parsed.values, ctx);
}

module.exports = { USAGE, defaultSite, inside, main, readSite, registry, serve };
