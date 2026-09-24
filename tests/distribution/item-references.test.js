'use strict';
// AGSC-02-10: an item's authored sources are shown on its page as References —
// the title linked to the source, then the author and year the item records.

const test = require('node:test');
const assert = require('node:assert');
const html = require('../../src/distribution/html.js');
const { render } = require('../../src/knowledge/markdown.js');

const page = (sources) => html.itemPage({ slug: 'x', title: 'X', type: 'concept', body: 'Body.\n', sources },
  { render: (body) => render(body) });

test('each source is a numbered reference: linked title, then author and year', () => {
  const out = page([
    { resource: 'https://arxiv.org/abs/2210.03629', title: 'ReAct', author: 'Shunyu Yao et al.', year: 2022 },
    { resource: 'https://example.org/b', title: 'Second' },
  ]);
  assert.match(out, /<h2 id="references">References<\/h2>/u);
  assert.match(out, /<li id="source-1"><a href="https:\/\/arxiv\.org\/abs\/2210\.03629">ReAct<\/a> — Shunyu Yao et al\., 2022<\/li>/u);
  assert.match(out, /<li id="source-2"><a href="https:\/\/example\.org\/b">Second<\/a><\/li>/u);
});

test('no sources, no References heading; a non-web resource is text, never a link', () => {
  assert.doesNotMatch(page([]), /id="references"/u);
  const out = page([{ resource: 'urn:isbn:0000', title: 'A book' }]);
  assert.match(out, /<li id="source-1">A book<\/li>/u);
  assert.doesNotMatch(out, /href="urn:/u);
});

test('titles and authors are escaped', () => {
  assert.match(page([{ resource: 'https://e.org/', title: '<b>t</b>', author: 'A & B' }]),
    /&lt;b&gt;t&lt;\/b&gt;<\/a> — A &amp; B/u);
});

test('the front page is the introduction plus a short Browse block, never every item', () => {
  const out = html.homePage({
    title: 'Node', description: 'A node.', introHtml: '<p>Intro.</p>',
    sections: [{ href: '/clusters/', title: 'Clusters', count: 2 }, { href: '/search/', title: 'Search' }],
  }, {});
  assert.match(out, /<p>Intro\.<\/p>\n<h2 id="browse">Browse<\/h2>/u);
  assert.match(out, /<li><a href="\/clusters\/">Clusters<\/a> \(2\)<\/li><li><a href="\/search\/">Search<\/a><\/li>/u);
  assert.match(html.homePage({ title: 'N', introHtml: '', sections: [] }, {}), /Nothing here yet\./u);
});
