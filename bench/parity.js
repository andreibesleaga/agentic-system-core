'use strict';
/**
 * bench/parity.js — page-tool / MCP parity, call by call (measurement layer F).
 *
 * AGSC-09-16 asks for ONE tool contract over two transports
 * whose answers are equal AS VALUES, never byte-identical across the browser
 * boundary. This module measures exactly that, over a call list that is data
 * (`bench/corpus/parity-calls.json`), for any Bundle:
 *
 *   stdio   the real `agsc mcp` process, driven over JSON-RPC frames on stdio —
 *           the answer an MCP client gets (the reference for every comparison)
 *   page    the EMITTED `/compose/agsc-core.js` + `/compose/agsc-page-tools.js`,
 *           run in a fresh `vm` context over the build's own published bytes —
 *           the answer a browser page gets
 *   module  `src/distribution/page-tools.js` called as the module exports it
 *   local   `src/distribution/mcp-tools.js` called in process over the whole Bundle
 *   projected  the same server over the PUBLISHED projection of AGSC-06-30
 *
 * Two comparisons, each after a JSON round trip (the wire form of both
 * transports), with `util.isDeepStrictEqual`:
 *   transport  stdio == local: the MCP process answers what the module answers
 *   parity     page == projected and module == projected: the rule's own
 *              comparison, because AGSC-09-16 makes "the Bundle a page
 *              serves the published projection" — on a Bundle holding a draft
 *              the stdio server legitimately sees more items than any page can
 * and, for every item that is NOT published, the page must answer `AGSC-E301`
 * to `read`, `links` and `propose`, "exactly as the local server answers for a
 * slug that does not exist". The harness is
 * the one `tests/distribution/page-tools.test.js` and `mcp-stdio.test.js`
 * already use; this module only widens the call list and counts.
 *
 * Deterministic: a fixed `SOURCE_DATE_EPOCH`, no network, no wall clock; the
 * stdio exchange is driven by responses, never by a timer.
 */

const cp = require('node:child_process');
const path = require('node:path');
const util = require('node:util');
const vm = require('node:vm');

const REPO = path.resolve(__dirname, '..');
const EPOCH = '1767225600';

/** Expand one argument value: `{ "repeat": { "text", "count" } }` becomes the long string. */
function expand(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && value.repeat) {
    return String(value.repeat.text).repeat(value.repeat.count);
  }
  if (Array.isArray(value)) return value.map(expand);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = expand(v);
    return out;
  }
  return value;
}

/**
 * The concrete call list for one Bundle: the fixed calls, then each per-item
 * template once for every item, with `$slug` replaced by the item's slug.
 * @param {{calls:Array<[string,object]>, per_item:Array<[string,object]>}} spec
 * @param {string[]} slugs
 * @returns {Array<[string, object]>}
 */
function callList(spec, slugs) {
  const out = spec.calls.map(([name, args]) => [name, expand(args)]);
  for (const slug of slugs) {
    for (const [name, args] of spec.per_item || []) {
      out.push([name, JSON.parse(JSON.stringify(args).split('$slug').join(slug))]);
    }
  }
  return out;
}

/** Build a Bundle in process and return the three in-process toolsets. */
function inProcess(bundleDir, options = {}) {
  const { createFileSystem, readSchemas } = require(path.join(REPO, 'src', 'adapters', 'node-fs.js'));
  const { createClock } = require(path.join(REPO, 'src', 'adapters', 'node-clock.js'));
  const validate = require(path.join(REPO, 'src', 'knowledge', 'validate.js'));
  const { loadBundle } = require(path.join(REPO, 'src', 'application', 'bundle.js'));
  const site = require(path.join(REPO, 'src', 'distribution', 'site.js'));
  const mcpTools = require(path.join(REPO, 'src', 'distribution', 'mcp-tools.js'));
  const pageTools = require(path.join(REPO, 'src', 'distribution', 'page-tools.js'));
  const compose = require(path.join(REPO, 'src', 'composition', 'compose.js'));

  const fs = createFileSystem(bundleDir);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(REPO)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } });
  const { files } = site.build(bundle, { clock, fs }, { specVersion: options.specVersion || '1.0.0-rc.6', version: options.version || '0.0.0' });
  const sources = {};
  for (const [route, text] of files) sources[route] = String(text);
  const bundleId = (bundle.config.bundle || {}).id;

  const context = vm.createContext({ TextEncoder });
  vm.runInContext(sources['/compose/agsc-core.js'], context, { filename: 'agsc-core.js' });
  vm.runInContext(sources['/compose/agsc-page-tools.js'], context, { filename: 'agsc-page-tools.js' });
  const api = vm.runInContext('globalThis.AGSC_PAGE_TOOLS', context);
  const core = vm.runInContext('globalThis.AGSC_CORE', context);

  // `publishedItems` answers with FLATTENED items (the emitters' shape); the server
  // takes the loaded shape, so the projection is the loaded items it names.
  const publishedSlugs = new Set(site.publishedItems(bundle.items, bundle.config.releases).map((i) => i.slug));
  const published = bundle.items.filter((i) => publishedSlugs.has(i.slug));
  return {
    bundle,
    local: mcpTools.tools(bundle, {}),
    projected: mcpTools.tools({ ...bundle, byslug: undefined, items: published }, {}),
    published: published.map((i) => i.slug).sort(),
    module: pageTools.pageToolset(pageTools.pageCorpus(sources, { bundleId }), { compose: compose.compose }),
    page: api.pageToolset(api.pageCorpus(sources, { bundleId: api.BUNDLE_ID }), core),
    slugs: bundle.items.map((i) => i.slug).sort(),
  };
}

/**
 * Ask the real `agsc mcp` process every call, one frame at a time.
 * @returns {Promise<{answers:Array<object>, code:number, stderr:string}>}
 */
function overStdio(bundleDir, calls) {
  return new Promise((resolve) => {
    const child = cp.spawn(process.execPath, [path.join(REPO, 'bin', 'agsc.js'), 'mcp'], {
      cwd: bundleDir, env: { NO_COLOR: '1', PATH: process.env.PATH, SOURCE_DATE_EPOCH: EPOCH }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const frames = [{
      id: 0, jsonrpc: '2.0', method: 'initialize',
      params: { capabilities: {}, clientInfo: { name: 'bench-parity', version: '0' }, protocolVersion: '2025-11-25' },
    }, ...calls.map(([name, args], i) => ({ id: i + 1, jsonrpc: '2.0', method: 'tools/call', params: { arguments: args, name } }))];
    let buffer = '';
    let stderr = '';
    let sent = 0;
    const answers = [];
    const next = () => {
      if (sent >= frames.length) { child.stdin.end(); return; }
      child.stdin.write(`${JSON.stringify(frames[sent])}\n`);
      sent += 1;
    };
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => { stderr += d; });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      buffer += d;
      let at = buffer.indexOf('\n');
      while (at >= 0) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 1);
        if (line.trim() !== '') {
          const frame = JSON.parse(line);
          if (frame.id > 0) answers[frame.id - 1] = frame.result ? frame.result.structuredContent : { rpc_error: frame.error };
          next();
        }
        at = buffer.indexOf('\n');
      }
    });
    child.on('exit', (code) => resolve({ answers, code, stderr }));
    next();
  });
}

const wire = (value) => JSON.parse(JSON.stringify(value));

/**
 * Compare every call across the four answers.
 * @param {string} bundleDir a Bundle directory (read only; `agsc mcp` writes nothing)
 * @param {{calls:Array, per_item:Array}} spec the call list
 * @returns {Promise<object>} the parity record for this Bundle
 */
async function run(bundleDir, spec, options = {}) {
  const hosts = inProcess(bundleDir, options);
  const calls = callList(spec, hosts.published);
  const stdio = await overStdio(bundleDir, calls);
  const differing = [];
  const perTool = Object.create(null);
  let transportEqual = 0;
  for (let i = 0; i < calls.length; i += 1) {
    const [name, args] = calls[i];
    const reference = wire(hosts.projected.call(name, args));
    const row = perTool[name] || { calls: 0, equal: 0 };
    perTool[name] = row;
    row.calls += 1;
    const unequal = ['page', 'module'].filter((host) => !util.isDeepStrictEqual(wire(hosts[host].call(name, args)), reference));
    if (util.isDeepStrictEqual(wire(stdio.answers[i]), wire(hosts.local.call(name, args)))) transportEqual += 1;
    else unequal.push('stdio');
    if (unequal.length === 0) row.equal += 1;
    else differing.push({ args: JSON.stringify(args).slice(0, 120), hosts: unequal, tool: name });
  }
  // AGSC-09-16: an unpublished item is invisible to a page tool.
  const unpublished = hosts.slugs.filter((slug) => !hosts.published.includes(slug));
  let hidden = 0;
  for (const slug of unpublished) {
    for (const name of ['read', 'links', 'propose']) {
      const body = wire(hosts.page.call(name, { slug })).body || {};
      if (body.code === 'AGSC-E301') hidden += 1;
    }
  }
  const types = Object.create(null);
  for (const a of stdio.answers) {
    const t = (a && a.type) || 'none';
    types[t] = (types[t] || 0) + 1;
  }
  return {
    answer_types: types,
    calls: calls.length,
    differing,
    equal: calls.length - differing.length,
    items: hosts.slugs.length,
    items_published: hosts.published.length,
    per_tool: perTool,
    stdio_exit: stdio.code,
    stdio_stderr_bytes: Buffer.byteLength(stdio.stderr),
    transport_equal: transportEqual,
    unpublished_calls: unpublished.length * 3,
    unpublished_answered_e301: hidden,
  };
}

module.exports = { callList, expand, inProcess, overStdio, run };
