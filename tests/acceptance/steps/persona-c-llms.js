'use strict';
// verifies AGSC-06-46, AGSC-06-25
// Steps of features/persona-c-agent-mcp.feature for an agent that lands on a page of the node:
// every HTML page of the build names the node's `/llms.txt` with the relation `describedby` and
// the type `text/plain`, and an item page names its Markdown copy `/pages/<slug>.md` with the
// relation `alternate` and the type `text/markdown` — the two page-level relations of llms.txt v2
// (AGSC-06-46). The discovery document keeps the first `describedby` link (AGSC-06-25). The head
// is read with the reader of the conformance case `build-0033`.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { headLinks } = require('../../conformance/areas/_build-page-links.js');

/** Every `.html` file under `www/`, as a path relative to the Bundle. */
function pages(world) {
  return fs.readdirSync(path.join(world.dir, 'www'), { recursive: true }).map(String)
    .filter((rel) => rel.endsWith('.html')).map((rel) => `www/${rel.split(path.sep).join('/')}`).sort();
}

const linksOf = (world, rel) => headLinks(world.read(rel));

module.exports = [
  {
    pattern: /^every HTML page the build wrote names "([^"]+)" in its head with the relation "([^"]+)" and the type "([^"]+)" \(AGSC-06-46\)$/u,
    run(world, href, rel, type) {
      const all = pages(world);
      assert.ok(all.length > 10, `the build wrote ${all.length} pages`);
      for (const page of all) {
        const found = linksOf(world, page).filter((l) => l.href === href && l.rel === rel && l.type === type);
        assert.strictEqual(found.length, 1, `${page}: ${JSON.stringify(linksOf(world, page))}`);
      }
    },
  },
  {
    pattern: /^the page "([^"]+)" names its Markdown copy "([^"]+)" with the relation "([^"]+)" and the type "([^"]+)", and the build wrote that copy$/u,
    run(world, page, href, rel, type) {
      assert.deepStrictEqual(linksOf(world, page).filter((l) => l.rel === rel && l.type === type), [{ href, rel, type }]);
      assert.ok(world.exists(`www${href}`), `www${href} was not written`);
    },
  },
  {
    pattern: 'the home page names no Markdown copy, and its first describedby link is still the discovery document (AGSC-06-25)',
    run(world) {
      const links = linksOf(world, 'www/index.html');
      assert.deepStrictEqual(links.filter((l) => l.type === 'text/markdown'), []);
      assert.deepStrictEqual(links.find((l) => l.rel === 'describedby'),
        { href: '/.well-known/knowledge-linkset', rel: 'describedby', type: 'application/linkset+json' });
    },
  },
];
