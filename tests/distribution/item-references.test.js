'use strict';
// AGSC-02-10: an item's authored sources are shown on its page as References —
// each a full citation: `Author (Year). Title. <address>. Checked YYYY-MM-DD.`,
// with every missing part (and its punctuation) left out.

const test = require('node:test');
const assert = require('node:assert');
const html = require('../../src/distribution/html.js');
const { render } = require('../../src/knowledge/markdown.js');

const page = (sources) => html.itemPage({ slug: 'x', title: 'X', type: 'concept', body: 'Body.\n', sources },
  { render: (body) => render(body) });
const U = 'https://arxiv.org/abs/2210.03629';
const A = `<a href="${U}">${U}</a>`;
const one = (src) => {
  const m = /<ol class="sources"><li id="source-1">(.*?)<\/li><\/ol>/u.exec(page([src]));
  assert.ok(m, 'one numbered reference');
  return m[1];
};

test('all fields: author (year), linked title, the full address, checked date; grade never shown', () => {
  const out = page([
    { resource: U, title: 'ReAct', author: 'Shunyu Yao et al.', year: '2022', verified: '2026-09-26', grade: 'primary' },
    { resource: 'https://example.org/b', title: 'Second' },
  ]);
  assert.match(out, /<h2 id="references">References<\/h2>\n<ol class="sources">/u);
  assert.ok(out.includes(`<li id="source-1">Shunyu Yao et al. (2022). <a href="${U}">ReAct</a>. <span class="source-url">${A}</span>. Checked 2026-09-26.</li>`));
  assert.ok(out.includes('<li id="source-2"><a href="https://example.org/b">Second</a>. <span class="source-url"><a href="https://example.org/b">https://example.org/b</a></span>.</li>'));
  assert.doesNotMatch(out, /primary/u);
});

test('missing author: the year follows the title', () => {
  assert.strictEqual(one({ resource: U, title: 'ReAct', year: '2022', verified: '2026-09-26' }),
    `<a href="${U}">ReAct</a> (2022). <span class="source-url">${A}</span>. Checked 2026-09-26.`);
});

test('missing year: the author stands alone, no doubled full stop', () => {
  assert.strictEqual(one({ resource: U, title: 'ReAct', author: 'Shunyu Yao et al.', verified: '2026-09-26' }),
    `Shunyu Yao et al. <a href="${U}">ReAct</a>. <span class="source-url">${A}</span>. Checked 2026-09-26.`);
  assert.strictEqual(one({ resource: U, title: 'Why?', author: 'Ada Lovelace' }),
    `Ada Lovelace. <a href="${U}">Why?</a> <span class="source-url">${A}</span>.`);
});

test('missing checked date: no Checked part; blank fields count as missing', () => {
  assert.strictEqual(one({ resource: U, title: 'ReAct', author: 'Yao', year: '2022' }),
    `Yao (2022). <a href="${U}">ReAct</a>. <span class="source-url">${A}</span>.`);
  assert.strictEqual(one({ resource: U, title: 'ReAct', author: ' ', year: '', verified: '' }),
    `<a href="${U}">ReAct</a>. <span class="source-url">${A}</span>.`);
  // A year that arrives as a number renders exactly as the same year as a string.
  assert.strictEqual(one({ resource: U, title: 'ReAct', author: 'Yao', year: 2022 }),
    one({ resource: U, title: 'ReAct', author: 'Yao', year: '2022' }));
});

test('a channel URN is shown as text, never a link', () => {
  const urn = 'urn:agsc:channel:ops:m-42';
  assert.strictEqual(one({ resource: urn, title: 'Incident thread', author: 'Ops', year: '2026', verified: '2026-09-01' }),
    `Ops (2026). Incident thread. <span class="source-url">${urn}</span>. Checked 2026-09-01.`);
  assert.doesNotMatch(page([{ resource: urn }]), /href="urn:/u);
  assert.strictEqual(one({ resource: urn }), `${urn}.`);
});

test('title missing: the address is the label and is not repeated', () => {
  assert.strictEqual(one({ resource: U, author: 'Yao', year: '2022', verified: '2026-09-26' }),
    `Yao (2022). ${A}. Checked 2026-09-26.`);
  assert.strictEqual(one({ resource: U, year: '2022' }), `${A} (2022).`);
  assert.doesNotMatch(page([{ resource: U }]), /source-url/u);
});

test('no sources, no References heading', () => {
  assert.doesNotMatch(page([]), /id="references"/u);
});

test('every part is escaped, the address included', () => {
  const out = one({ resource: 'https://e.org/?a=1&b="2"', title: '<b>t</b>', author: 'A & B', year: '2020', verified: '2026-01-02' });
  assert.strictEqual(out, 'A &amp; B (2020). <a href="https://e.org/?a=1&amp;b=&quot;2&quot;">&lt;b&gt;t&lt;/b&gt;</a>.'
    + ' <span class="source-url"><a href="https://e.org/?a=1&amp;b=&quot;2&quot;">https://e.org/?a=1&amp;b=&quot;2&quot;</a></span>. Checked 2026-01-02.');
});

test('the output is deterministic', () => {
  const src = [{ resource: U, title: 'ReAct', author: 'Yao', year: '2022', verified: '2026-09-26' }];
  assert.strictEqual(page(src), page(src));
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
