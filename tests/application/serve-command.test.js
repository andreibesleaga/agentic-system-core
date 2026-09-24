'use strict';
// tests/application/serve-command.test.js — the `agsc-host` command line over the
// fixture build: every built-in profile applied leaves the route set and every served
// byte as they were and only adds host configuration (AGSC-00-24(iii), AGSC-06-01);
// a profile written elsewhere is loaded through the plugin loader and checked like any
// plugin (AGSC-E905, AGSC-E004, AGSC-E901, AGSC-E902); the anchor round-trips; exit
// codes follow AGSC-09-08. Offline, fixed clock, stubbed history.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const hosting = require('../../src/application/hosting.js');
const builtins = require('../../src/distribution/hosts/index.js');
const rules = require('../../src/distribution/hosts/rules.js');
const { SPEC_VERSION } = require('../../src/application/cli/main.js');
const { captureStream } = require('../conformance/areas/_shared.js');
const { buildFixture, cleanup, snapshot, temporary, ROOT } = require('../distribution/hosts/_build.js');

test.after(cleanup);

/** Run the command line in a directory. */
async function run(argv, cwd, extra = {}) {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await hosting.main(argv, { cwd, specVersion: SPEC_VERSION, stderr, stdout, ...extra });
  const text = stdout.text();
  return { code, json: argv.includes('--json') && text !== '' ? JSON.parse(text) : null, stderr: stderr.text(), stdout: text };
}

// ------------------------------------------------------------------ the route set

test('every built-in profile only adds host configuration: the route set and every served byte are unchanged', async () => {
  for (const profile of builtins) {
    const root = buildFixture();
    const before = snapshot(path.join(root, 'www'));
    const result = await run(['emit', profile.name, '--json'], root);
    assert.strictEqual(result.code, 0, `${profile.name}: ${result.stdout}${result.stderr}`);
    assert.strictEqual(result.json.profile, profile.name);
    assert.strictEqual(result.json.claim, profile.claim);
    const after = snapshot(path.join(root, 'www'));
    assert.deepStrictEqual(rules.routesOf([...after.keys()]), rules.routesOf([...before.keys()]), `${profile.name}: routes`);
    for (const [file, bytes] of before) {
      if (rules.CONFIG_FILES.includes(file) && !bytes.equals(after.get(file))) continue; // replaced configuration
      assert.ok(bytes.equals(after.get(file)), `${profile.name} changed ${file}`);
    }
    for (const file of after.keys()) {
      assert.ok(before.has(file) || rules.CONFIG_FILES.includes(file), `${profile.name} added ${file}, which is not host configuration`);
    }
    for (const written of result.json.written) {
      const where = written.split('/');
      assert.ok(where[0] === 'www' || written.startsWith(`dist/hosts/${profile.name}/`), `${profile.name} wrote ${written}`);
    }
    // the same run again writes the same bytes
    const second = await run(['emit', profile.name, '--json'], root);
    assert.deepStrictEqual(second.json, result.json, profile.name);
  }
});

// ------------------------------------------------------------------ list and usage

test('list names every profile with its claim and limits, and says where Solid stands', async () => {
  const root = temporary();
  const human = await run(['list'], root);
  assert.strictEqual(human.code, 0);
  for (const profile of builtins) assert.ok(human.stdout.includes(`${profile.name} — ${profile.title}`), profile.name);
  assert.match(human.stdout, /^solid — .*declaration-only at 1\.0/mu);
  const json = await run(['list', '--json'], root);
  assert.deepStrictEqual(json.json.profiles.map((p) => p.name), builtins.map((p) => p.name));
  assert.strictEqual(json.json.status, 'pass');
});

test('usage errors are exit 2: unknown command, unknown flag, missing argument', async () => {
  const root = temporary();
  const cases = [
    [['nosuch'], 'AGSC-E001'], [['list', '--nosuch'], 'AGSC-E002'], [['emit'], 'AGSC-E003'],
    [['verify-anchor'], 'AGSC-E003'], [['serve', '--port'], 'AGSC-E003'], [['serve', '--port', 'x'], 'AGSC-E003'],
    [['serve', '--port', '70000'], 'AGSC-E003'],
  ];
  for (const [argv, code] of cases) {
    const human = await run(argv, root);
    assert.strictEqual(human.code, 2, argv.join(' '));
    assert.match(human.stderr, new RegExp(`${code}[\\s\\S]*usage: agsc-host`, 'u'), argv.join(' '));
    const json = await run([...argv, '--json'], root);
    assert.strictEqual(json.code, 2);
    assert.strictEqual(JSON.parse(json.stderr).code, code, argv.join(' '));
  }
  const bare = await run([], root);
  assert.deepStrictEqual([bare.code, bare.stdout.startsWith('usage: agsc-host')], [2, true]);
  const help = await run(['--help'], root);
  assert.deepStrictEqual([help.code, help.stdout], [0, `${hosting.USAGE}\n`]);
});

// ------------------------------------------------------------------ profiles written elsewhere

test('a profile named by a path is loaded through the plugin loader and runs like a built-in one', async () => {
  const root = buildFixture();
  const sample = path.join(ROOT, 'examples', 'hosts', 'header-rules.js');
  const result = await run(['emit', sample, '--json'], root);
  assert.strictEqual(result.code, 0, result.stdout);
  assert.deepStrictEqual(result.json.written, ['dist/hosts/header-rules/header-rules.json']);
  const body = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'hosts', 'header-rules', 'header-rules.json'), 'utf8'));
  const { input } = hosting.readSite(path.join(root, 'www'));
  assert.deepStrictEqual(body.rules.map((r) => [r.pattern, r.headers]), input.sets.map((s) => [s.route, s.headers]));
});

test('the single-file hook of the minimal deployment-profile sample is honoured as a server file', async () => {
  const root = buildFixture();
  const result = await run(['emit', path.join(ROOT, 'examples', 'plugins', 'deployment-profile.js'), '--json', '--out', 'host'], root);
  assert.strictEqual(result.code, 0, result.stdout);
  assert.deepStrictEqual(result.json.written, ['host/example-host.toml']);
  assert.strictEqual(result.json.claim, 'example-host', 'a plugin with no claim of its own is named by its name');
});

/** A plugin module written into the Bundle, then named by path. */
function plugin(root, name, body) {
  const file = path.join(root, `${name}.js`);
  fs.writeFileSync(file, `'use strict';\nmodule.exports = { agsc_spec_version: '1.0.0', kind: 'deployment-profile', name: ${JSON.stringify(name)}, plugin_api_version: '1.0.0', ${body} };\n`);
  return `./${name}.js`;
}

test('a profile is checked, not trusted: every fault is a finding and nothing is written', async () => {
  const root = buildFixture();
  const before = snapshot(path.join(root, 'www'));
  const cases = [
    ['replace-route', "emit: () => ({ site: [{ path: 'index.html', text: 'x' }] })", 'AGSC-E004'],
    ['climb', "emit: () => ({ server: [{ path: '../x', text: 'x' }] })", 'AGSC-E902'],
    ['absolute', "emit: () => ({ site: [{ path: '/etc/x', text: 'x' }] })", 'AGSC-E902'],
    ['not-list', "emit: () => ({ site: 'x' })", 'AGSC-E004'],
    ['not-entry', 'emit: () => ({ server: [{ path: 1 }] })', 'AGSC-E004'],
    ['throws', "emit: () => { throw new Error('boom'); }", 'AGSC-E901'],
    ['no-hook', 'claim: "x"', 'AGSC-E004'],
    ['own-finding', "emit: () => ({ findings: [{ code: 'AGSC-E204', message: 'mine', file: 'x' }, { code: 'nope' }] })", 'AGSC-E204'],
  ];
  for (const [name, body, code] of cases) {
    const result = await run(['emit', plugin(root, name, body), '--json'], root);
    assert.strictEqual(result.code, 1, name);
    assert.deepStrictEqual(result.json.findings.map((f) => f.code), [code], name);
    assert.deepStrictEqual(result.json.written, [], name);
  }
  const after = snapshot(path.join(root, 'www'));
  assert.deepStrictEqual([...after.keys()], [...before.keys()]);
  assert.ok(!fs.existsSync(path.join(root, 'dist')), 'nothing was written');
});

test('a remote, a malformed or an unknown profile is refused before anything is loaded', async () => {
  const root = buildFixture();
  const cases = [
    ['https://example.org/profile.js', 'AGSC-E905'],
    ['Not A Name', 'AGSC-E004'],
    ['no-such-profile-package', 'AGSC-E203'],
    ['./missing.js', 'AGSC-E901'],
  ];
  for (const [name, code] of cases) {
    const result = await run(['emit', name, '--json'], root);
    assert.strictEqual(result.code, 1, name);
    assert.deepStrictEqual(result.json.findings.map((f) => f.code), [code], name);
  }
  const human = await run(['emit', 'no-such-profile-package'], root);
  assert.match(human.stderr, /AGSC-E203 error: "no-such-profile-package" is not a hosting profile \(cloudflare-pages, static-host/u);
});

test('a plugin that targets another version is not admitted (AGSC-00-15, AGSC-00-24)', async () => {
  const root = buildFixture();
  const file = path.join(root, 'future.js');
  fs.writeFileSync(file, "module.exports = { agsc_spec_version: '1.9.0', kind: 'deployment-profile', name: 'future', plugin_api_version: '1.0.0', emit: () => ({}) };\n");
  const result = await run(['emit', './future.js', '--json'], root);
  assert.deepStrictEqual([result.code, result.json.findings.map((f) => f.code)], [1, ['AGSC-E004']]);
});

// ------------------------------------------------------------------ the build directory

test('a missing build directory is AGSC-E901; the directory comes from build.out', async () => {
  const empty = temporary();
  for (const argv of [['emit', 'static-host', '--json'], ['verify-anchor', 'x.json', '--json']]) {
    fs.writeFileSync(path.join(empty, 'x.json'), '{}');
    const result = await run(argv, empty);
    assert.deepStrictEqual([result.code, result.json.findings.map((f) => f.code)], [1, ['AGSC-E901']], argv.join(' '));
  }
  assert.strictEqual(hosting.defaultSite(empty), 'www');
  fs.writeFileSync(path.join(empty, 'agsc.config.json'), '{"build":{"out":"public"}}');
  assert.strictEqual(hosting.defaultSite(empty), 'public');
  fs.writeFileSync(path.join(empty, 'agsc.config.json'), '{not json');
  assert.strictEqual(hosting.defaultSite(empty), 'www');
});

test('a link inside the build is reported and never followed; a write through a link is refused', async () => {
  const root = buildFixture();
  const outside = temporary();
  fs.symlinkSync(outside, path.join(root, 'www', 'escape'));
  const read = hosting.readSite(path.join(root, 'www'));
  assert.deepStrictEqual(read.findings.map((f) => [f.code, f.file]), [['AGSC-E902', 'escape']]);
  fs.rmSync(path.join(root, 'www', 'escape'));
  // a profile's relative path that meets a link on the way out of --out
  fs.mkdirSync(path.join(root, 'o'));
  fs.symlinkSync(outside, path.join(root, 'o', 'sub'));
  const via = plugin(root, 'via-link', "emit: () => ({ server: [{ path: 'sub/x.txt', text: 'x' }] })");
  const result = await run(['emit', via, '--json', '--out', 'o'], root);
  assert.deepStrictEqual([result.code, result.json.findings.map((f) => f.code)], [1, ['AGSC-E902']]);
  assert.ok(!fs.existsSync(path.join(outside, 'x.txt')));
  fs.rmSync(path.join(root, 'www', '.nojekyll'), { force: true });
  fs.writeFileSync(path.join(outside, 'target'), 'x');
  fs.symlinkSync(path.join(outside, 'target'), path.join(root, 'www', '.nojekyll'));
  assert.strictEqual(hosting.inside(path.join(root, 'none'), path.join(root, 'none', 'x')), false, 'what does not exist is inside nothing');
  const through = await run(['emit', 'github-pages', '--json'], root);
  assert.deepStrictEqual(through.json.findings.map((f) => [f.code, f.file]), [['AGSC-E902', '.nojekyll']], 'the read refuses the link, so nothing is written');
  assert.strictEqual(fs.readFileSync(path.join(outside, 'target'), 'utf8'), 'x');
  // a file under --out that is itself a link is never written through
  fs.symlinkSync(path.join(outside, 'target'), path.join(root, 'o', 'x.txt'));
  const onto = plugin(root, 'onto-link', "emit: () => ({ server: [{ path: 'x.txt', text: 'overwritten' }] })");
  fs.rmSync(path.join(root, 'www', '.nojekyll'));
  const second = await run(['emit', onto, '--json', '--out', 'o'], root);
  assert.deepStrictEqual(second.json.findings.map((f) => f.code), ['AGSC-E902']);
  assert.strictEqual(fs.readFileSync(path.join(outside, 'target'), 'utf8'), 'x');
});

test('a malformed reference file is reported with its line', async () => {
  const root = buildFixture();
  fs.appendFileSync(path.join(root, 'www', '_redirects'), 'not a rule\n');
  const result = await run(['emit', 'cloudflare-pages', '--json'], root);
  assert.deepStrictEqual(result.json.findings.map((f) => [f.code, f.file]), [['AGSC-E204', '_redirects']]);
  assert.strictEqual(result.code, 1);
});

test('a file the command cannot write is a finding, not a crash', async () => {
  const root = buildFixture();
  fs.writeFileSync(path.join(root, 'blocked'), 'a file where a directory must go');
  const result = await run(['emit', 'ipfs', '--json', '--out', 'blocked/x'], root);
  assert.strictEqual(result.code, 1);
  assert.deepStrictEqual(result.json.findings.map((f) => f.code), ['AGSC-E901']);
});

// ------------------------------------------------------------------ the anchor

test('verify-anchor: the anchored build passes, a rebuilt one with other content does not', async () => {
  const root = buildFixture();
  const emitted = await run(['emit', 'ledger-anchor', '--json'], root);
  assert.strictEqual(emitted.code, 0);
  const anchorFile = 'dist/hosts/ledger-anchor/anchor.json';
  const pass = await run(['verify-anchor', anchorFile], root);
  assert.strictEqual(pass.code, 0);
  assert.match(pass.stdout, /the build is the one the anchor names/u);
  const other = buildFixture({ base: 'https://other.example/' });
  const fail = await run(['verify-anchor', path.join(root, anchorFile), '--json'], other);
  assert.strictEqual(fail.code, 1);
  assert.ok(fail.json.findings.every((f) => f.code === 'AGSC-E210'), JSON.stringify(fail.json.findings));
  assert.ok(fail.json.findings.some((f) => f.message.startsWith('anchor:')));
  const missing = await run(['verify-anchor', 'nope.json', '--json'], root);
  assert.deepStrictEqual([missing.code, missing.json.findings.map((f) => f.code)], [1, ['AGSC-E901']]);
});

// ------------------------------------------------------------------ serve

test('serve: listens on loopback, reports its address, and a port in use is a finding', async () => {
  const root = buildFixture();
  const servers = [];
  const result = await run(['serve', '--port', '0', '--json'], root, { onListening: (s) => servers.push(s) });
  assert.strictEqual(result.code, 0, result.stdout + result.stderr);
  assert.match(result.json.url, /^http:\/\/(127\.0\.0\.1|\[::1\]):\d+\/$/u);
  const port = servers[0].address().port;
  const status = await new Promise((resolve) => http.get(`${result.json.url}`, (res) => { res.resume(); resolve(res.statusCode); }));
  assert.strictEqual(status, 200);
  const busy = await run(['serve', '--port', String(port), '--bind', servers[0].address().address, '--json'], root);
  assert.deepStrictEqual([busy.code, busy.json.findings.map((f) => f.code)], [1, ['AGSC-E901']]);
  const human = await run(['serve', '--port', '0', '--bind', '0.0.0.0'], root, { onListening: (s) => servers.push(s) });
  assert.strictEqual(human.code, 0);
  assert.match(human.stdout, /serving .* at http:\/\/0\.0\.0\.0:\d+\/ — read-only/u);
  assert.match(human.stdout, /not a loopback address: put a TLS terminator in front/u);
  const nowhere = await run(['serve', '--site', 'nope', '--json'], root);
  assert.deepStrictEqual(nowhere.json.findings.map((f) => f.code), ['AGSC-E901']);
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
});

test('the agsc-host program runs as its own command', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'bin', 'agsc-host.js'), 'list', '--json'], { cwd: temporary() });
  assert.deepStrictEqual(JSON.parse(out).profiles.map((p) => p.name), builtins.map((p) => p.name));
});
