'use strict';

// FINAL-VERIFY-29. AGSC-09-16 requires a page tool's answer to be the
// local server's answer "for the same input and Bundle". The local server keys its
// items with a `Map` (`distribution/mcp-tools.js`), which answers `undefined` for a
// member of `Object.prototype`; the page tools kept the same index in a plain object
// literal, whose prototype chain answers a FUNCTION for `constructor`, `toString`,
// `valueOf`, `hasOwnProperty` and friends. The `item === undefined` guard therefore
// never fired, and `read`, `propose` and `links` returned a well-formed SUCCESS
// envelope carrying `slug: undefined` and the literal string "undefined" as an item's
// Markdown, where the local server answers `AGSC-E301`.
//
// The same confusion reached `remember`: `pageKindToType()[args.kind]` is not
// `undefined` for `constructor`, so `kind` survived the guard and `type` became the
// `Object` constructor, producing
// `path: "content/function Object() { [native code] }s/<slug>.md"`.

const test = require('node:test');
const assert = require('node:assert/strict');

const pageTools = require('../../src/distribution/page-tools.js');

/** The members every plain object inherits and that no Bundle can hold as a slug. */
const INHERITED = ['constructor', 'toString', 'valueOf', 'hasOwnProperty',
  'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', '__proto__'];

/** A two-item corpus built exactly the way the emitted script builds one. */
function corpus() {
  return pageTools.pageCorpus({
    '/search.json': JSON.stringify({
      docs: [{ slug: 'alpha', title: 'Alpha' }],
      terms: { alpha: [0] },
    }),
    '/pages/alpha.md': '---\ntype: concept\ntitle: Alpha\nkind: explainer\n---\n\nBody.\n',
  }, { bundleId: 'b', base: 'https://example.test/' });
}

test('read, propose and links answer AGSC-E301 for an inherited member name (AGSC-09-16)', () => {
  const tools = pageTools.pageToolset(corpus(), null);
  for (const name of INHERITED) {
    for (const verb of ['read', 'propose', 'links']) {
      const answer = tools.call(verb, { slug: name });
      assert.equal(answer.type, 'error', `${verb}(${name}) must be an error envelope`);
      assert.equal(answer.body.code, 'AGSC-E301', `${verb}(${name}) code`);
      assert.equal(answer.trust, 'untrusted');
    }
  }
});

test('an inherited member name never becomes an item IRI or a Markdown body', () => {
  const tools = pageTools.pageToolset(corpus(), null);
  const answer = tools.call('propose', { slug: 'toString' });
  assert.equal(JSON.stringify(answer).includes('undefined'), false,
    'the answer must not carry the literal string "undefined"');
  assert.equal(JSON.stringify(answer).includes('/concepts/undefined/'), false);
});

test('remember refuses an inherited member as a kind and never names a function (AGSC-09-14b)', () => {
  const tools = pageTools.pageToolset(corpus(), null);
  for (const name of INHERITED) {
    const answer = tools.call('remember', {
      kind: name, title: 'Title Here', body: 'b', at: '2026-01-01T00:00:00Z',
    });
    assert.equal(answer.type, 'proposal', `remember(kind=${name})`);
    assert.equal(answer.body.path, 'content/concepts/title-here.md',
      `remember(kind=${name}) must fall back to concept, not to ${name}`);
    assert.equal(typeof answer.body.frontmatter.type, 'string');
    assert.equal(answer.body.frontmatter.type, 'concept');
  }
});

test('the real kinds still map, so the fallback is not vacuous', () => {
  const tools = pageTools.pageToolset(corpus(), null);
  const answer = tools.call('remember', {
    actor: 'process:ci', kind: 'episode', title: 'Title Here', body: 'b', at: '2026-01-01T00:00:00Z',
  });
  assert.equal(answer.body.frontmatter.type, 'episode');
  assert.equal(answer.body.path, 'content/episodes/title-here.md');
  assert.equal(tools.call('read', { slug: 'alpha' }).type, 'item');
});

test('pageEdges does not resolve a Link target to an inherited member (AGSC-03-11)', () => {
  const edges = pageTools.pageEdges([{
    slug: 'alpha',
    path: 'content/concepts/alpha.md',
    type: 'concept',
    frontmatter: { title: 'Alpha', links: { related: ['constructor'] } },
    body: '',
  }]);
  for (const edge of edges) {
    assert.notEqual(edge.target, 'constructor');
    assert.equal(typeof edge.target === 'string' || edge.target === undefined, true);
  }
});
