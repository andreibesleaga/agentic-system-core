'use strict';
// tests/distribution/hosts/profiles.test.js — every built-in hosting profile against
// the fixture build: it registers as a `deployment-profile` plugin (AGSC-00-24), its
// output is deterministic, its claim names it (AGSC-06-01, AGSC-09-01), its limits are
// stated, and what it emits for a host carries the reference header and redirect
// semantics route by route. No network, no clock, no git: the build's history is a
// fixed stub (`_build.js`).

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const builtins = require('../../../src/distribution/hosts/index.js');
const rules = require('../../../src/distribution/hosts/rules.js');
const profileKit = require('../../../src/distribution/hosts/profile.js');
const staticHost = require('../../../src/distribution/hosts/static-host.js');
const githubPages = require('../../../src/distribution/hosts/github-pages.js');
const ipfs = require('../../../src/distribution/hosts/ipfs.js');
const ledgerAnchor = require('../../../src/distribution/hosts/ledger-anchor.js');
const cloudflare = require('../../../src/distribution/hosts/cloudflare-pages.js');
const plugins = require('../../../src/application/plugins.js');
const hosting = require('../../../src/application/hosting.js');
const { SPEC_VERSION } = require('../../../src/application/cli/main.js');
const { canonicalize } = require('../../../src/knowledge/jcs.js');
const { buildFixture, cleanup } = require('./_build.js');

test.after(cleanup);

let cached = null;
/** The fixture build, read as a profile's input (once per file). */
function site() {
  if (cached === null) {
    const dir = buildFixture();
    const { input, findings } = hosting.readSite(path.join(dir, 'www'));
    assert.deepStrictEqual(findings, []);
    cached = input;
  }
  return cached;
}

const byName = (list) => Object.fromEntries(list.map(([n, v]) => [n.toLowerCase(), v]));

// ------------------------------------------------------------------ every profile

test('seven built-in profiles, each admitted by the deployment-profile registry and no other', () => {
  assert.deepStrictEqual(builtins.map((p) => p.name),
    ['cloudflare-pages', 'static-host', 'github-pages', 'local', 'git-clone', 'ipfs', 'ledger-anchor']);
  const { registry, findings } = hosting.registry(SPEC_VERSION);
  assert.deepStrictEqual(findings, []);
  assert.deepStrictEqual(registry.names(), builtins.map((p) => p.name));
  for (const profile of builtins) {
    const other = plugins.createRegistry('surface', { specVersion: SPEC_VERSION }).register(profile);
    assert.strictEqual(other.registered, false, profile.name);
    assert.ok(Object.isFrozen(profile), `${profile.name} is frozen`);
  }
});

test('every profile\'s claim names it, and every profile states its limits', () => {
  for (const profile of builtins) {
    assert.ok(profile.claim.startsWith(`${profile.name} `), profile.name);
    assert.ok(profile.limits.length >= 2, profile.name);
    for (const limit of profile.limits) assert.match(limit, /^[A-Z`a-z].*\.$/u, `${profile.name}: ${limit}`);
    assert.strictEqual(typeof profile.title, 'string');
  }
});

test('every profile is deterministic: the same build gives the same bytes, twice', () => {
  for (const profile of builtins) {
    const a = profile.emit(site());
    const b = profile.emit(JSON.parse(JSON.stringify(site())));
    assert.deepStrictEqual(a, b, profile.name);
    assert.deepStrictEqual(a.findings.filter((f) => f.severity === 'error'), [], profile.name);
  }
});

test('the conformance sentence names the deployment profile (AGSC-06-01, AGSC-09-01)', () => {
  const sentence = profileKit.claimSentence({
    date: '2026-09-24', implementation: 'Example', level: 2, passed: 153, profile: staticHost,
    specVersion: '1.0.0-rc.6', total: 153, version: '1.0.0',
  });
  assert.strictEqual(sentence, 'Example 1.0.0 conforms to AgenticSystemCore 1.0.0-rc.6, Level 2.'
    + ' Verified against the published conformance vectors on 2026-09-24: 153 of 153 passed.'
    + ` Deployment profile: static-host — ${staticHost.claim}.`);
});

// ------------------------------------------------------------------ static-host: nginx

const unquote = (s) => {
  const t = s.trim();
  return t.startsWith('"') ? t.slice(1, -1).replace(/\\(.)/gu, '$1') : t;
};

/** The subset of nginx configuration the profile writes, parsed into location blocks. */
function parseNginx(text) {
  const blocks = new Map();
  let current = null;
  const top = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const open = /^location (=\s)?(\S+) \{$/u.exec(line);
    if (open) {
      current = { exact: Boolean(open[1]), lines: [] };
      blocks.set(`${open[1] ? '=' : ''}${open[2]}`, current);
    } else if (line === '}') {
      current = null;
    } else if (current) {
      current.lines.push(line);
    } else {
      top.push(line);
    }
  }
  return { blocks, top };
}

/** What nginx sends for one route: the ONE location it selects, and only its headers. */
function nginxHeaders(parsed, route) {
  const block = parsed.blocks.get(`=${route}`) || parsed.blocks.get('/');
  const out = [];
  for (const line of block.lines) {
    const header = /^add_header (\S+) (".*") always;$/u.exec(line);
    const type = /^default_type (".*");$/u.exec(line);
    if (header) out.push([header[1], unquote(header[2])]);
    if (type) {
      assert.ok(block.lines.includes('types { }'), `${route}: default_type without an emptied types map sends the extension's type`);
      out.push(['Content-Type', unquote(type[1])]);
    }
  }
  return out;
}

test('static-host: nginx, parsed, sends every route exactly the reference headers', () => {
  const input = site();
  const { server, site: files } = staticHost.emit(input);
  assert.deepStrictEqual(files.map((f) => f.path), ['.htaccess']);
  const conf = server.find((f) => f.path === 'nginx.conf').text;
  const parsed = parseNginx(conf);
  assert.ok(parsed.top.includes('absolute_redirect off;'));
  assert.ok(parsed.top.includes('error_page 404 /404.html;'));
  const routes = rules.routesOf(input.files);
  assert.ok(routes.length >= 40, `the fixture has ${routes.length} routes`);
  for (const route of routes) {
    assert.deepStrictEqual(byName(nginxHeaders(parsed, route)), byName(rules.headersFor(input.sets, route)), route);
  }
  // the 404 page and any unknown path: the site-wide set, on every status (`always`)
  assert.deepStrictEqual(byName(nginxHeaders(parsed, '/no/such/')), byName(staticHost.siteWide(input.sets)));
  // the directory route `/` is answered by its own block, so its Link header is kept
  assert.ok(parsed.blocks.get('=/').lines.includes('try_files /index.html =404;'));
  // the 0.0.x alias, and the host configuration kept from being served
  assert.deepStrictEqual(parsed.blocks.get('=/.well-known/agentic-knowledge').lines, ['return 301 /.well-known/knowledge-linkset;']);
  for (const file of rules.CONFIG_FILES) assert.deepStrictEqual(parsed.blocks.get(`=/${file}`).lines, ['return 404;'], file);
});

// ------------------------------------------------------------------ static-host: Apache

/** The subset of Apache configuration the profile writes. */
function parseApache(text) {
  const sections = [];
  const redirects = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const open = /^<If "%\{REQUEST_URI\} =~ m#(.*)#">$/u.exec(line);
    const redirect = /^RedirectMatch (\d{3}) (".*?") ?(".*")?$/u.exec(line);
    if (open) {
      current = { headers: [], re: new RegExp(open[1], 'u') };
      sections.push(current);
    } else if (line === '</If>') {
      current = null;
    } else if (current) {
      const h = /^Header always set (\S+) (".*")$/u.exec(line);
      assert.ok(h, `unexpected line in an <If>: ${line}`);
      current.headers.push([h[1], unquote(h[2])]);
    } else if (redirect) {
      redirects.push({ re: new RegExp(unquote(redirect[2]), 'u'), status: Number(redirect[1]), to: redirect[3] ? unquote(redirect[3]) : null });
    }
  }
  return { redirects, sections };
}

/** What Apache sends: every true <If>, in order, a later `set` winning; a directory is its index file. */
function apacheHeaders(parsed, route) {
  const uri = route.endsWith('/') ? `${route}index.html` : route;
  const out = [];
  for (const section of parsed.sections) {
    if (!section.re.test(uri)) continue;
    for (const [name, value] of section.headers) {
      const at = out.findIndex(([n]) => n.toLowerCase() === name.toLowerCase());
      if (at === -1) out.push([name, value]);
      else out[at] = [name, value];
    }
  }
  return out;
}

test('static-host: Apache, parsed, sends every route exactly the reference headers', () => {
  const input = site();
  const text = staticHost.emit(input).site[0].text;
  assert.ok(!text.includes('ForceType'), 'ForceType lower-cases parameter values');
  for (const line of text.split('\n').filter((l) => /^(<If|RedirectMatch)/u.test(l))) {
    assert.ok(!line.includes('\\'), `no backslash inside a quoted expression: ${line}`);
  }
  const parsed = parseApache(text);
  assert.strictEqual(parsed.sections.length, input.sets.length, 'one <If> per reference rule');
  for (const route of rules.routesOf(input.files)) {
    assert.deepStrictEqual(byName(apacheHeaders(parsed, route)), byName(rules.headersFor(input.sets, route)), route);
  }
  const alias = parsed.redirects.find((r) => r.status === 301);
  assert.ok(alias.re.test('/.well-known/agentic-knowledge'));
  assert.ok(!alias.re.test('/.well-known/agentic-knowledge-x'), 'anchored, unlike a Redirect prefix');
  assert.strictEqual(alias.to, '/.well-known/knowledge-linkset');
  const hide = parsed.redirects.find((r) => r.status === 404);
  for (const file of rules.CONFIG_FILES) assert.ok(hide.re.test(`/${file}`), file);
  assert.ok(!hide.re.test('/x_headers'));
});

test('static-host refuses what either server would re-interpret, and emits nothing then', () => {
  const base = { files: [{ path: 'a.txt' }], redirects: [], sets: [{ headers: [['X', 'ok']], route: '/*' }] };
  const cases = [
    { sets: [{ headers: [['X', 'a $var']], route: '/*' }] },
    { sets: [{ headers: [['X', '5%']], route: '/*' }] },
    { sets: [{ headers: [['X', '1']], route: '/a b' }] },
    { redirects: [{ from: '/old/*', status: 301, to: '/new/' }] },
    { redirects: [{ from: '/old', status: 301, to: '/n w' }] },
    { sets: [{ headers: [['X', '1']], route: '/*' }, { headers: [['x', '2']], route: '/a.txt' }] },
  ];
  for (const change of cases) {
    const answer = staticHost.emit({ ...base, ...change });
    assert.ok(answer.findings.length > 0, JSON.stringify(change));
    assert.ok(answer.findings.every((f) => f.code === 'AGSC-E204'));
    assert.deepStrictEqual([answer.site, answer.server], [[], []]);
  }
  assert.deepStrictEqual(staticHost.emit(base).findings, []);
  assert.deepStrictEqual(staticHost.apacheHeadersFor(undefined, '/'), []);
  assert.deepStrictEqual(staticHost.siteWide(undefined), []);
});

// ------------------------------------------------------------------ github-pages

test('github-pages: .nojekyll in the build, and the per-route header table for the proxy in front', () => {
  const input = site();
  const answer = githubPages.emit(input);
  assert.deepStrictEqual(answer.site, [{ path: '.nojekyll', text: '' }]);
  const table = JSON.parse(answer.server[0].text);
  assert.strictEqual(answer.server[0].path, 'headers.json');
  assert.deepStrictEqual(table.routes.map((r) => r.route), rules.routesOf(input.files));
  for (const row of table.routes) {
    assert.deepStrictEqual(row.headers.map((h) => [h.name, h.value]), rules.headersFor(input.sets, row.route), row.route);
  }
  assert.deepStrictEqual(table.redirects, input.redirects);
  assert.ok(githubPages.limits.some((l) => /no response header/u.test(l)));
  assert.ok(githubPages.limits.some((l) => /application\/linkset\+json/u.test(l)));
});

// ------------------------------------------------------------------ ipfs

test('ipfs: the web redirects file carries the alias and the 404 page; the manifest every file', () => {
  const input = site();
  const answer = ipfs.emit(input);
  const lines = answer.site[0].text.trimEnd().split('\n');
  assert.strictEqual(answer.site[0].path, '_redirects');
  assert.ok(lines[0].startsWith('# '), 'a comment line');
  assert.deepStrictEqual(lines.slice(1), ['/.well-known/agentic-knowledge /.well-known/knowledge-linkset 301', '/* /404.html 404']);
  const manifest = JSON.parse(answer.server[0].text);
  assert.deepStrictEqual(manifest.files, input.files.map((f) => ({ path: f.path, sha256: f.sha256, size: f.size })));
  assert.ok(ipfs.limits.some((l) => /subdomain or DNSLink/u.test(l)));
});

test('ipfs: a redirects file over 64 KiB is refused, not truncated', () => {
  const redirects = Array.from({ length: 3000 }, (_, i) => ({ from: `/old-${i}-${'x'.repeat(10)}/`, status: 301, to: `/new-${i}/` }));
  const answer = ipfs.emit({ files: [], redirects, sets: [] });
  assert.deepStrictEqual(answer.findings.map((f) => f.code), ['AGSC-E904']);
  assert.deepStrictEqual([answer.site, answer.server], [[], []]);
});

// ------------------------------------------------------------------ ledger-anchor

test('ledger-anchor: the anchor is the build\'s published facts, JCS-canonical, with its own digest', () => {
  const input = site();
  const answer = ledgerAnchor.emit(input);
  assert.deepStrictEqual(answer.findings, []);
  const [anchorFile, digestFile] = answer.server;
  const record = JSON.parse(anchorFile.text);
  assert.strictEqual(anchorFile.text, `${canonicalize(record)}\n`);
  assert.deepStrictEqual(Object.keys(record), ['agsc_anchor', 'anchor', 'bundle_hash', 'bundle_version',
    'discovery_digest', 'generated_at', 'ledger_head', 'spec_version']);
  const doc = JSON.parse(input.discoveryText).linkset[0];
  const graph = doc.describedby.find((l) => l.href.endsWith('/graph.jsonld'));
  assert.strictEqual(record.bundle_hash, graph['agsc-bundle-hash'][0]);
  assert.strictEqual(record.bundle_version, graph['agsc-bundle-version'][0]);
  assert.strictEqual(record.ledger_head, doc['https://w3id.org/agentic-system-core/rel#ledger'][0]['agsc-ledger-head'][0]);
  assert.match(record.discovery_digest, /^sha-256=:[A-Za-z0-9+/]{43}=:$/u);
  const hex = require('node:crypto').createHash('sha256').update(anchorFile.text).digest('hex');
  assert.strictEqual(digestFile.text, `${hex}  anchor.json\n`);
  assert.deepStrictEqual(answer.site, []);
});

test('ledger-anchor: an anchor reads back as the same build, and any change is named', () => {
  const input = site();
  const text = ledgerAnchor.emit(input).server[0].text;
  assert.deepStrictEqual(ledgerAnchor.verify(text, input), []);
  const record = JSON.parse(text);
  const moved = { ...record, bundle_hash: 'sha-256=:AAAA:', ledger_head: 'f'.repeat(64) };
  assert.deepStrictEqual(ledgerAnchor.verify(JSON.stringify(moved), input).map((f) => f.code), ['AGSC-E210', 'AGSC-E701']);
  const changed = { ...input, discoveryText: input.discoveryText.replace('"linkset"', '"linkset" ') };
  assert.deepStrictEqual(ledgerAnchor.verify(text, changed).map((f) => f.message.split(':')[0]), ['discovery_digest']);
  for (const bad of ['not json', '[]', '{"agsc_anchor":"2"}', 'null']) {
    assert.deepStrictEqual(ledgerAnchor.verify(bad, input).map((f) => f.code), ['AGSC-E201'], bad);
  }
  assert.deepStrictEqual(ledgerAnchor.verify(text, { discoveryText: null }).map((f) => f.code), ['AGSC-E901']);
});

test('ledger-anchor: no discovery document is AGSC-E901, a malformed one AGSC-E201, a missing fact a warning', () => {
  assert.deepStrictEqual(ledgerAnchor.emit({ discoveryText: null }).findings.map((f) => f.code), ['AGSC-E901']);
  for (const text of ['{', '{"linkset":[{"anchor":"https://x.example/"}]}', '{"linkset":[{"describedby":[{"href":"https://x.example/graph.jsonld"}]}]}']) {
    const answer = ledgerAnchor.emit({ discoveryText: text });
    assert.deepStrictEqual(answer.findings.map((f) => f.code), ['AGSC-E201'], text);
    assert.deepStrictEqual(answer.server, []);
  }
  const bare = JSON.stringify({ linkset: [{ anchor: 'https://x.example/', describedby: [{ 'agsc-spec-version': ['1.0.0-rc.6'], href: 'https://x.example/graph.jsonld' }] }] });
  const answer = ledgerAnchor.emit({ discoveryText: bare });
  assert.deepStrictEqual(answer.findings.map((f) => [f.code, f.severity, f.message.split(';')[0]]), [
    ['AGSC-E202', 'warn', 'the discovery document publishes no bundle hash'],
    ['AGSC-E202', 'warn', 'the discovery document publishes no bundle version'],
    ['AGSC-E202', 'warn', 'the discovery document publishes no generated at'],
    ['AGSC-E202', 'warn', 'the discovery document publishes no ledger head'],
  ]);
  assert.deepStrictEqual(Object.keys(JSON.parse(answer.server[0].text)), ['agsc_anchor', 'anchor', 'discovery_digest', 'spec_version']);
});

// ------------------------------------------------------------------ the reference, local, git-clone

test('cloudflare-pages writes nothing and requires the two files agsc build writes', () => {
  assert.deepStrictEqual(cloudflare.emit(site()), { findings: [], server: [], site: [] });
  const missing = cloudflare.emit({ hasHeadersFile: false, hasRedirectsFile: false });
  assert.deepStrictEqual(missing.findings.map((f) => [f.code, f.file]), [['AGSC-E901', '_headers'], ['AGSC-E901', '_redirects']]);
});

test('local and git-clone write no configuration: the server reads the reference files itself', () => {
  for (const name of ['local', 'git-clone']) {
    const profile = builtins.find((p) => p.name === name);
    assert.deepStrictEqual(profile.emit(site()), { findings: [], server: [], site: [] }, name);
  }
  assert.ok(builtins.find((p) => p.name === 'git-clone').limits.some((l) => /RFC 8615|well-known location/u.test(l)));
});
