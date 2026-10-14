'use strict';
// tests/distribution/hosts/local.test.js — the `local` profile's answer to one
// request, as data: status, headers and file, over an in-memory view of a build.
// The server that writes the answer to a socket is proved over loopback in
// tests/application/serve-loopback.test.js.

const test = require('node:test');
const assert = require('node:assert');

const local = require('../../../src/distribution/hosts/local.js');
const headers = require('../../../src/distribution/headers.js');
const rules = require('../../../src/distribution/hosts/rules.js');

const FILES = new Set(['index.html', '404.html', 'graph.jsonld', 'concepts/index.html',
  '.well-known/knowledge-linkset', 'pages/a.md', '_headers', '_redirects', '.htaccess', 'blob']);

function view(files = FILES) {
  return {
    isDirectory: (rel) => [...files].some((f) => f.startsWith(`${rel}/`)),
    isFile: (rel) => files.has(rel),
    redirects: rules.parseRedirects(headers.redirectsFile()).rules,
    sets: headers.headerSets({}),
    sha256: (rel) => `${rel.length}`.padStart(64, '0'),
    hosts: local.hostNames('localhost'),
  };
}

const get = (path, extra) => local.respond({ host: 'localhost:8080', method: 'GET', path, ...extra }, view());
const header = (answer, name) => (answer.headers.find(([n]) => n.toLowerCase() === name.toLowerCase()) || [])[1];

test('a route is its file with the reference headers, a sha-256 entity tag and a content type', () => {
  const answer = get('/.well-known/knowledge-linkset');
  assert.strictEqual(answer.status, 200);
  assert.strictEqual(answer.file, '.well-known/knowledge-linkset');
  assert.deepStrictEqual(answer.headers.slice(0, -1), rules.headersFor(headers.headerSets({}), '/.well-known/knowledge-linkset'));
  assert.strictEqual(header(answer, 'ETag'), `"${'29'.padStart(64, '0')}"`);
  const page = get('/concepts/');
  assert.strictEqual(page.file, 'concepts/index.html');
  assert.strictEqual(header(page, 'Content-Type'), 'text/html; charset=utf-8');
  assert.strictEqual(header(get('/'), 'Link'), '</.well-known/knowledge-linkset>; rel="describedby"; type="application/linkset+json"');
  assert.strictEqual(header(get('/blob'), 'Content-Type'), 'application/octet-stream');
});

test('the entity tag answers If-None-Match with 304 and no file', () => {
  const tag = header(get('/graph.jsonld'), 'ETag');
  const answer = get('/graph.jsonld', { ifNoneMatch: tag });
  assert.deepStrictEqual([answer.status, answer.file], [304, null]);
  assert.strictEqual(get('/graph.jsonld', { ifNoneMatch: '"other"' }).status, 200);
});

test('redirects first, then files; a directory without its slash is 301 to it', () => {
  assert.deepStrictEqual(get('/.well-known/agentic-knowledge'),
    { file: null, headers: [['Location', '/.well-known/knowledge-linkset']], status: 301 });
  assert.deepStrictEqual(get('/concepts'), { file: null, headers: [['Location', '/concepts/']], status: 301 });
});

test('host configuration is never served, and a missing path is the 404 page, as HTML', () => {
  for (const path of ['/_headers', '/_redirects', '/.htaccess', '/nope', '/pages/missing.md']) {
    const answer = get(path);
    assert.deepStrictEqual([answer.status, answer.file], [404, '404.html'], path);
    assert.strictEqual(header(answer, 'Content-Type'), 'text/html; charset=utf-8', path);
    assert.strictEqual(header(answer, 'X-Frame-Options'), 'DENY', path);
  }
  const none = local.respond({ host: 'localhost', method: 'GET', path: '/nope' }, view(new Set(['index.html'])));
  assert.deepStrictEqual([none.status, none.file], [404, null]);
});

test('read-only: any method but GET and HEAD is 405; HEAD is answered like GET', () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', undefined]) {
    assert.deepStrictEqual(local.respond({ host: 'localhost', method, path: '/' }, view()), { file: null, headers: [['Allow', 'GET, HEAD']], status: 405 });
  }
  assert.deepStrictEqual(local.respond({ host: 'localhost:8080', method: 'head', path: '/' }, view()), get('/'));
});

test('a path that does not decode or climbs out is 400 and names no file', () => {
  for (const path of ['/%E0%A4%A', '/../etc/passwd', '/a/%2e%2e/b', '/./x', '/a%5Cb', '/a%00', 'relative']) {
    assert.deepStrictEqual(get(path), { file: null, headers: [], status: 400 }, path);
  }
  assert.strictEqual(local.decoded('/a%20b'), '/a b');
});

test('the content type of a file no reference header names comes from the closed list', () => {
  assert.strictEqual(local.typeOf('a/b.CSS'), 'text/css; charset=utf-8');
  assert.strictEqual(local.typeOf('SKILL.md'), 'text/markdown; charset=utf-8');
  assert.strictEqual(local.typeOf('noext'), 'application/octet-stream');
  assert.strictEqual(local.typeOf('x.unknown'), 'application/octet-stream');
  for (const type of Object.values(local.TYPES)) assert.match(type, /^[a-z]+\/[a-z0-9.+-]+(; charset=utf-8)?$/u);
});

test('the Host a request names: localhost, a loopback address or a bound name; 421 for any other, 400 for none', () => {
  assert.deepStrictEqual(local.hostNames('localhost'), ['localhost', '[::1]']);
  assert.deepStrictEqual(local.hostNames('0.0.0.0', '::', 'Node.Example', undefined, ''), ['localhost', '[::1]', '0.0.0.0', '[::]', 'node.example']);
  assert.deepStrictEqual(local.hostNames('[::1]', '::1'), ['localhost', '[::1]']);
  for (const host of ['localhost', 'localhost:8080', 'LocalHost:1', '127.0.0.1', '127.0.0.1:80', '127.255.0.9:8080', '[::1]', '[::1]:8080', '[::1]:']) {
    assert.strictEqual(local.hostName(host) !== null && local.allowedHost(host, local.hostNames()), true, host);
  }
  for (const host of ['attacker.example', 'attacker.example:8080', 'localhost.', 'localhost.attacker.example', '127.0.0.1.nip.io',
    '128.0.0.1', '127.0.0.256', '[::2]', '0.0.0.0', 'node.example']) {
    assert.strictEqual(local.allowedHost(host, local.hostNames()), false, host);
  }
  assert.strictEqual(local.allowedHost('node.example:443', local.hostNames('node.example')), true);
  assert.strictEqual(local.allowedHost('[::]:8080', local.hostNames('::')), true);
  for (const host of [undefined, '', 'a b', 'localhost:x', '[::1', 'a:1:2', ':80']) assert.strictEqual(local.hostName(host), null, String(host));
  assert.strictEqual(local.hostName('Node.Example:8080'), 'node.example');

  const asked = (host, hosts) => local.respond({ host, method: 'GET', path: '/' }, { ...view(), hosts }).status;
  assert.strictEqual(asked('attacker.example:8080', local.hostNames()), 421);
  assert.strictEqual(asked(undefined, local.hostNames()), 400);
  assert.strictEqual(asked('a b', local.hostNames()), 400);
  assert.strictEqual(asked('localhost', undefined), 421, 'a view with no list of names answers no Host');
  assert.deepStrictEqual(local.respond({ host: 'attacker.example', method: 'POST', path: '/' }, view()), { file: null, headers: [], status: 421 },
    'the Host is checked before anything else');
});

test('a dot segment other than .well-known is not served, and host files are hidden whatever their case', () => {
  const files = new Set(['404.html', '.ssh/x', '.secret', 'sub/.htaccess', '.hidden/index.html', '.well-known/knowledge-linkset',
    '.well-known/.private', '_HEADERS', '_Redirects', '.NOJEKYLL', 'sub/_headers']);
  const ask = (path) => local.respond({ host: 'localhost', method: 'GET', path }, view(files));
  for (const path of ['/.ssh/x', '/.secret', '/sub/.htaccess', '/.hidden/', '/.hidden', '/.well-known/.private', '/_HEADERS', '/_Redirects', '/.NOJEKYLL']) {
    assert.deepStrictEqual([ask(path).status, ask(path).file], [404, '404.html'], path);
  }
  assert.deepStrictEqual([ask('/.well-known/knowledge-linkset').status, ask('/.well-known/knowledge-linkset').file], [200, '.well-known/knowledge-linkset']);
  assert.strictEqual(ask('/sub/_headers').status, 200, 'only the root holds host configuration');
  assert.strictEqual(local.hidden('.well-known/knowledge-linkset'), false);
  assert.strictEqual(local.hidden('a/.b/c'), true);
  assert.strictEqual(local.hidden('_headers'), true);
  assert.strictEqual(local.hidden('a/b'), false);
});
