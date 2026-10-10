'use strict';
// tests/application/serve-configured-site.test.js — the build directory `agsc-host`
// reads when no `--site` is given. It is `build.out`, resolved through every layer of
// the configuration (the project file, the `.env` file, the process environment;
// AGSC-01-37) and held to AGSC-01-19 and AGSC-01-35: a value outside the grammar is
// `AGSC-E204`, one with a `..` or `.` segment or a leading `/` is `AGSC-E902`, and one
// that reaches outside the Bundle root through a link is `AGSC-E902`. A refused value
// makes `emit`, `serve` and `verify-anchor` write, serve and read nothing. An explicit
// `--site` stays the user's choice. Writes under a folder are checked before any
// folder is made. Offline; every directory is a throwaway one.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const hosting = require('../../src/application/hosting.js');
const { SPEC_VERSION } = require('../../src/application/cli/main.js');
const { captureStream } = require('../conformance/areas/_shared.js');
const { buildFixture, cleanup, temporary } = require('../distribution/hosts/_build.js');

test.after(cleanup);

/** Run the command line in a directory. */
async function run(argv, cwd, extra = {}) {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await hosting.main(argv, { cwd, specVersion: SPEC_VERSION, stderr, stdout, ...extra });
  const text = stdout.text();
  return { code, json: argv.includes('--json') && text !== '' ? JSON.parse(text) : null, stderr: stderr.text(), stdout: text };
}

/** Set `build.out` in the Bundle's configuration file. */
function configure(root, out) {
  const file = path.join(root, 'agsc.config.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  config.build.out = out;
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

/** Every entry under a directory, as sorted relative paths. */
function entries(dir) {
  return fs.readdirSync(dir, { recursive: true }).map(String).sort();
}

const codes = (result) => result.json.findings.map((f) => f.code);

// ------------------------------------------------------------------ the project file

test('a build.out outside the Bundle makes emit refuse and write nothing there', async () => {
  const root = buildFixture();
  const outside = temporary();
  const values = [
    [path.relative(root, outside).split(path.sep).join('/'), ['AGSC-E204', 'AGSC-E902']],
    ['../escape-site', ['AGSC-E204', 'AGSC-E902']],
    [outside.split(path.sep).join('/'), ['AGSC-E204', 'AGSC-E902']],
    ['content', ['AGSC-E204']],
    ['dist', ['AGSC-E204']],
    ['Content/www', ['AGSC-E204']],
    ['www/./x', ['AGSC-E204', 'AGSC-E902']],
    ['', ['AGSC-E204', 'AGSC-E902']],
  ];
  for (const [out, want] of values) {
    configure(root, out);
    for (const profile of ['static-host', 'github-pages', 'ipfs', 'cloudflare-pages']) {
      const result = await run(['emit', profile, '--json'], root);
      assert.strictEqual(result.code, 1, `${out} ${profile}: ${result.stdout}`);
      assert.deepStrictEqual(codes(result), want, `${out} ${profile}`);
      assert.strictEqual(result.json.written, undefined, `${out} ${profile}`);
    }
    assert.deepStrictEqual(entries(outside), [], `${out}: nothing was written outside the Bundle`);
  }
  assert.ok(!fs.existsSync(path.join(root, 'dist')), 'no server file was written either');
  assert.ok(!fs.existsSync(path.join(path.dirname(root), 'escape-site')), 'no folder was made beside the Bundle');
  // The human form names the value and the rule.
  configure(root, '../escape-site');
  const human = await run(['emit', 'static-host'], root);
  assert.strictEqual(human.code, 1);
  assert.match(human.stderr, /AGSC-E902 error: agsc\.config\.json: build\.out "\.\.\/escape-site" .*AGSC-01-35/u);
  assert.match(human.stderr, /agsc-host emit: fail \(2 error, 0 warn\)/u);
});

test('a build.out that is not a string is refused, not replaced by the default', async () => {
  const root = buildFixture();
  configure(root, 7);
  const result = await run(['emit', 'static-host', '--json'], root);
  assert.deepStrictEqual([result.code, codes(result)], [1, ['AGSC-E204']]);
  assert.match(result.json.findings[0].message, /build\.out is not a string/u);
});

test('a well-formed build.out is read: a trailing slash is stripped, and the default is www', async () => {
  const root = buildFixture();
  configure(root, 'www/');
  const result = await run(['emit', 'static-host', '--json'], root);
  assert.strictEqual(result.code, 0, result.stdout);
  assert.ok(result.json.written.includes('www/.htaccess'), result.stdout);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'agsc.config.json'), 'utf8'));
  delete config.build;
  fs.writeFileSync(path.join(root, 'agsc.config.json'), JSON.stringify(config));
  assert.deepStrictEqual(hosting.defaultSite(root), { findings: [], out: 'www' });
  fs.writeFileSync(path.join(root, 'agsc.config.json'), '{not json');
  assert.deepStrictEqual(hosting.defaultSite(root), { findings: [], out: 'www' }, 'a file that does not parse leaves the default; lint reports it');
  assert.deepStrictEqual(hosting.defaultSite(temporary()), { findings: [], out: 'www' }, 'no configuration at all');
});

test('a build.out that reaches outside the Bundle through a link is AGSC-E902', async () => {
  const root = buildFixture();
  const outside = temporary();
  fs.cpSync(path.join(root, 'www'), outside, { recursive: true });
  fs.symlinkSync(outside, path.join(root, 'linked'));
  configure(root, 'linked');
  const before = entries(outside);
  for (const argv of [['emit', 'static-host', '--json'], ['verify-anchor', 'agsc.config.json', '--json'], ['serve', '--port', '0', '--json']]) {
    const result = await run(argv, root);
    assert.deepStrictEqual([result.code, codes(result)], [1, ['AGSC-E902']], argv.join(' '));
    assert.match(result.json.findings[0].message, /outside the Bundle root through a link/u, argv.join(' '));
  }
  assert.deepStrictEqual(entries(outside), before, 'nothing was written through the link');
});

// ------------------------------------------------------------------ the other layers

test('the same value set through AGSC_BUILD_OUT or the .env file is refused the same way', async () => {
  const root = buildFixture();
  const outside = temporary();
  const rel = path.relative(root, outside).split(path.sep).join('/');
  for (const [env, want] of [[{ AGSC_BUILD_OUT: rel }, 'AGSC-E204'], [{ AGSC_BUILD_OUT: 'content' }, 'AGSC-E204'],
    [{ AGSC_BUILD_OUT: outside }, 'AGSC-E204'], [{ AGSC_BUILD_OUT: 'dist' }, 'AGSC-E204']]) {
    const result = await run(['emit', 'static-host', '--json'], root, { env });
    assert.deepStrictEqual([result.code, codes(result)], [1, [want]], JSON.stringify(env));
    assert.match(result.json.findings[0].message, /^AGSC_BUILD_OUT: /u);
  }
  fs.writeFileSync(path.join(root, '.env'), `AGSC_BUILD_OUT=${rel}\n`);
  const dotenv = await run(['emit', 'static-host', '--json'], root);
  assert.deepStrictEqual([dotenv.code, codes(dotenv)], [1, ['AGSC-E204']]);
  fs.rmSync(path.join(root, '.env'));
  assert.deepStrictEqual(entries(outside), []);
  assert.ok(!fs.existsSync(path.join(root, 'dist')));
  assert.ok(!fs.existsSync(path.join(root, 'content', '.htaccess')));
});

test('a valid value from the environment wins over the project file, as for agsc', async () => {
  const root = buildFixture();
  fs.renameSync(path.join(root, 'www'), path.join(root, 'public'));
  const result = await run(['emit', 'static-host', '--json'], root, { env: { AGSC_BUILD_OUT: 'public', PATH: '/bin' } });
  assert.strictEqual(result.code, 0, result.stdout);
  assert.ok(result.json.written.includes('public/.htaccess'), result.stdout);
  assert.deepStrictEqual(hosting.defaultSite(root, { AGSC_BUILD_OUT: 'public' }), { findings: [], out: 'public' });
});

test('a configuration the engine cannot read is a finding, not a crash', async () => {
  const root = buildFixture();
  // Over the input cap of AGSC-01-16, the .env file is refused by the FileSystem port.
  fs.writeFileSync(path.join(root, '.env'), `# ${'x'.repeat(1024 * 1024)}\nAGSC_BUILD_OUT=www\n`);
  const result = await run(['emit', 'static-host', '--json'], root);
  assert.deepStrictEqual([result.code, codes(result)], [1, ['AGSC-E904']], result.stdout);
  assert.match(result.json.findings[0].message, /^the configuration cannot be read: /u);
  assert.ok(!fs.existsSync(path.join(root, 'www', '.htaccess')));
  // A .env file that is a link out of the Bundle is not read at all, as for agsc.
  fs.rmSync(path.join(root, '.env'));
  const outside = temporary();
  fs.writeFileSync(path.join(outside, 'env'), 'AGSC_BUILD_OUT=../elsewhere\n');
  fs.symlinkSync(path.join(outside, 'env'), path.join(root, '.env'));
  assert.deepStrictEqual(hosting.defaultSite(root), { findings: [], out: 'www' });
});

// ------------------------------------------------------------------ serve and verify-anchor

test('serve and verify-anchor refuse a hostile build.out too, and serve listens on nothing', async () => {
  const root = buildFixture();
  const anchorFile = path.join(root, 'anchor.json');
  fs.writeFileSync(anchorFile, '{}');
  for (const out of ['../escape-site', '/etc', 'content']) {
    configure(root, out);
    const listening = [];
    const served = await run(['serve', '--port', '0', '--json'], root, { onListening: (s) => listening.push(s) });
    assert.strictEqual(served.code, 1, out);
    assert.ok(codes(served).includes(out === 'content' ? 'AGSC-E204' : 'AGSC-E902'), `${out}: ${served.stdout}`);
    assert.deepStrictEqual(listening, [], `${out}: no server was started`);
    const verified = await run(['verify-anchor', 'anchor.json', '--json'], root);
    assert.strictEqual(verified.code, 1, out);
    assert.ok(codes(verified).every((c) => c === 'AGSC-E204' || c === 'AGSC-E902'), `${out}: ${verified.stdout}`);
  }
  const env = await run(['serve', '--port', '0', '--json'], root, { env: { AGSC_BUILD_OUT: '../x' } });
  assert.strictEqual(env.code, 1);
});

test('an explicit --site stays the user\'s choice', async () => {
  const root = buildFixture();
  const elsewhere = path.join(temporary(), 'site');
  fs.cpSync(path.join(root, 'www'), elsewhere, { recursive: true });
  configure(root, '../escape-site');
  const result = await run(['emit', 'static-host', '--site', elsewhere, '--json'], root, { env: { AGSC_BUILD_OUT: 'content' } });
  assert.strictEqual(result.code, 0, result.stdout);
  assert.ok(fs.existsSync(path.join(elsewhere, '.htaccess')));
  const servers = [];
  const served = await run(['serve', '--site', elsewhere, '--port', '0', '--json'], root, { onListening: (s) => servers.push(s) });
  assert.strictEqual(served.code, 0, served.stdout);
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
});

// ------------------------------------------------------------------ writes checked before any folder is made

/** A deployment-profile plugin module written into the Bundle, named by path. */
function plugin(root, name, body) {
  fs.writeFileSync(path.join(root, `${name}.js`), `'use strict';\nmodule.exports = { agsc_spec_version: '1.0.0', kind: 'deployment-profile', name: ${JSON.stringify(name)}, plugin_api_version: '1.0.0', ${body} };\n`);
  return `./${name}.js`;
}

test('a write is checked before any folder is made: a link on the way leaves no folder behind', async () => {
  const root = buildFixture();
  const outside = temporary();
  fs.symlinkSync(outside, path.join(root, 'www', 'sub'));
  // The build directory now holds a link, so the read refuses it; the write check is
  // proved under --out, where nothing is read.
  fs.mkdirSync(path.join(root, 'o'));
  fs.symlinkSync(outside, path.join(root, 'o', 'sub'));
  fs.rmSync(path.join(root, 'www', 'sub'));
  const deep = plugin(root, 'deep', "emit: () => ({ server: [{ path: 'first.txt', text: 'x' }, { path: 'sub/deeper/x.txt', text: 'x' }] })");
  const result = await run(['emit', deep, '--json', '--out', 'o'], root);
  assert.deepStrictEqual([result.code, codes(result)], [1, ['AGSC-E902']], result.stdout);
  assert.deepStrictEqual(entries(outside), [], 'no folder was made through the link');
  assert.ok(!fs.existsSync(path.join(root, 'o', 'first.txt')), 'a refused run writes nothing at all');
  // A link that points nowhere is refused the same way.
  fs.symlinkSync(path.join(outside, 'gone'), path.join(root, 'o', 'dangling'));
  const dangling = plugin(root, 'dangling', "emit: () => ({ server: [{ path: 'dangling/x.txt', text: 'x' }] })");
  const second = await run(['emit', dangling, '--json', '--out', 'o'], root);
  assert.deepStrictEqual([second.code, codes(second)], [1, ['AGSC-E902']], second.stdout);
  assert.ok(!fs.existsSync(path.join(outside, 'gone')));
});

test('the default --out stays inside the Bundle: a dist folder that is a link is refused', async () => {
  const root = buildFixture();
  const outside = temporary();
  fs.symlinkSync(outside, path.join(root, 'dist'));
  const result = await run(['emit', 'static-host', '--json'], root);
  assert.deepStrictEqual([result.code, codes(result)], [1, ['AGSC-E902']], result.stdout);
  assert.deepStrictEqual(entries(outside), []);
  assert.ok(!fs.existsSync(path.join(root, 'www', '.htaccess')), 'a refused run writes nothing at all');
  // An explicit --out is the user's choice, as --site is.
  const chosen = await run(['emit', 'static-host', '--json', '--out', path.join(outside, 'chosen')], root);
  assert.strictEqual(chosen.code, 0, chosen.stdout);
  assert.ok(fs.existsSync(path.join(outside, 'chosen', 'nginx.conf')));
});
