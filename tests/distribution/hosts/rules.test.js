'use strict';
// tests/distribution/hosts/rules.test.js — the reference semantics every hosting
// profile is compared with (AGSC-06-01, AGSC-06-17): `_headers` and `_redirects` read
// back as data, and what the reference host sends for one path.

const test = require('node:test');
const assert = require('node:assert');

const rules = require('../../../src/distribution/hosts/rules.js');
const headers = require('../../../src/distribution/headers.js');

test('the generated _headers reads back as exactly the header sets it was written from', () => {
  for (const config of [{}, { visibility: 'restricted' }]) {
    const { sets, findings } = rules.parseHeaders(headers.headersFile(config));
    assert.deepStrictEqual(findings, []);
    assert.deepStrictEqual(sets, headers.headerSets(config));
  }
});

test('the generated _redirects reads back as its rules, and a missing status is 302', () => {
  const { rules: list, findings } = rules.parseRedirects(headers.redirectsFile([{ from: '/a/', to: '/b/' }]));
  assert.deepStrictEqual(findings, []);
  assert.deepStrictEqual(list, [
    { from: '/.well-known/agentic-knowledge', status: 301, to: '/.well-known/knowledge-linkset' },
    { from: '/a/', status: 301, to: '/b/' },
  ]);
  assert.deepStrictEqual(rules.parseRedirects('/x /y\r\n').rules, [{ from: '/x', status: 302, to: '/y' }]);
});

test('a line outside the grammar the build writes is reported, never guessed at', () => {
  const h = rules.parseHeaders('https://example.org/*\n  X: 1\n/a\n  not a header\n  Y: 2\n');
  assert.deepStrictEqual(h.findings.map((f) => [f.code, f.line]), [['AGSC-E204', 1], ['AGSC-E204', 2], ['AGSC-E204', 4]]);
  assert.deepStrictEqual(h.sets, [{ headers: [['Y', '2']], route: '/a' }]);
  const r = rules.parseRedirects('# c\n/a /b 301 extra\nb /c\n/a\n/a /b 99\n/a /b x\n');
  assert.deepStrictEqual(r.findings.map((f) => f.line), [2, 3, 4, 5, 6]);
  assert.deepStrictEqual(r.rules, []);
  assert.deepStrictEqual(rules.parseHeaders(null), { findings: [], sets: [] });
  assert.deepStrictEqual(rules.parseRedirects(undefined), { findings: [], rules: [] });
});

test('a splat matches greedily, across slashes; every other character is literal', () => {
  assert.ok(rules.matches('/*', '/'));
  assert.ok(rules.matches('/*', '/a/b/c.md'));
  assert.ok(rules.matches('/pages/*.md', '/pages/a/b.md'));
  assert.ok(!rules.matches('/pages/*.md', '/pages/a.mdx'));
  assert.ok(rules.matches('/graph.jsonld', '/graph.jsonld'));
  assert.ok(!rules.matches('/graph.jsonld', '/graphXjsonld'), 'a dot is literal');
  assert.ok(!rules.matches('/', '/a'));
  assert.ok(rules.matches('/(a)+[b]', '/(a)+[b]'), 'regular-expression characters are literal');
});

test('every matching rule applies, in order, and a repeated name is joined with a comma', () => {
  const sets = [
    { headers: [['X-A', '1'], ['Vary', 'Accept']], route: '/*' },
    { headers: [['vary', 'Origin'], ['X-B', '2']], route: '/p/*' },
    { headers: [['X-C', '3']], route: '/q' },
  ];
  assert.deepStrictEqual(rules.headersFor(sets, '/p/x'), [['X-A', '1'], ['Vary', 'Accept, Origin'], ['X-B', '2']]);
  assert.deepStrictEqual(rules.headersFor(sets, '/q'), [['X-A', '1'], ['Vary', 'Accept'], ['X-C', '3']]);
  assert.deepStrictEqual(rules.headersFor(undefined, '/q'), []);
});

test('the first redirect whose source is the path wins; none is null', () => {
  const list = [{ from: '/a', status: 301, to: '/b' }, { from: '/a', status: 302, to: '/c' }];
  assert.deepStrictEqual(rules.redirectFor(list, '/a'), list[0]);
  assert.strictEqual(rules.redirectFor(list, '/b'), null);
  assert.strictEqual(rules.redirectFor(undefined, '/b'), null);
});

test('a build file answers one route; host configuration answers none', () => {
  assert.strictEqual(rules.routeOf('index.html'), '/');
  assert.strictEqual(rules.routeOf('concepts/a/index.html'), '/concepts/a/');
  assert.strictEqual(rules.routeOf('graph.jsonld'), '/graph.jsonld');
  for (const file of rules.CONFIG_FILES) assert.strictEqual(rules.routeOf(file), null, file);
  assert.strictEqual(rules.routeOf('x/_headers'), '/x/_headers', 'only the top-level file is configuration');
  assert.deepStrictEqual(rules.routesOf(['b.txt', { path: 'a/index.html' }, '_headers', '.htaccess']), ['/a/', '/b.txt']);
  assert.deepStrictEqual(rules.routesOf(undefined), []);
});

// I-119: a route with several splats was the regular expression `^a.*b.*c$`, which
// retries every split of the path (cubic in the path for three splats) on a path that
// ends wrong. The matcher is linear in the path, and says what the expression said.
test('a pattern with several splats matches exactly what its regular expression matched', () => {
  const { texts } = require('../../_linear-kit');
  const oracle = (pattern, path) => new RegExp(
    `^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\/]/gu, '\\$&')).join('.*')}$`, 'u').test(path);
  const pieces = ['*', 'a', 'b', '/', '.', 'ab'];
  const paths = [...texts(21, 300, ['a', 'b', '/', '.', '\n', 'ab'], 14)];
  for (const pattern of texts(22, 300, pieces, 8)) {
    for (const path of paths) {
      assert.strictEqual(rules.matches(pattern, path), oracle(pattern, path), `${JSON.stringify(pattern)} ${JSON.stringify(path)}`);
    }
  }
});

test('many splats against a long path that ends wrong finish (no backtracking over splits)', { timeout: 120000 }, () => {
  const path = 'a'.repeat(1024 * 1024);
  assert.strictEqual(rules.matches(`/${'*a'.repeat(40)}*b`, `/${path}`), false);
  assert.strictEqual(rules.matches(`${'*a'.repeat(40)}*`, path), true);
});
