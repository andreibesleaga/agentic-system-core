'use strict';
// verifies AGSC-08-31
// Steps of features/persona-i-maintainer.feature for the minimum-sources check: the maintainer
// sets `lint.min_sources` in the configuration of a scratch copy of the acceptance Bundle, gives
// one pattern a source and another only the address of a note a model wrote, and reads the
// AGSC-E417 warnings of the real `agsc lint --json` (AGSC-08-31: a text a model wrote cannot
// ground another). Offline: lint reads the item files only.

const assert = require('node:assert');

module.exports = [
  {
    pattern: /^the configuration sets "lint\.min_sources" to (\d+)$/u,
    run(world, n) {
      const config = JSON.parse(world.read('agsc.config.json'));
      config.lint = { ...(config.lint || {}), min_sources: Number(n) };
      world.write('agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);
    },
  },
  {
    pattern: /^the item "(content\/[^"]+\.md)" cites "(https:\/\/[^"]+)" in "sources\[\]"$/u,
    run(world, rel, resource) {
      world.write(rel, world.read(rel).replace(/\n---\n/u, `\nsources:\n  - resource: ${resource}\n---\n`));
    },
  },
  {
    pattern: /^the ai-generated term "content\/concepts\/([a-z0-9-]+)\.md" is added, and the item "(content\/[^"]+\.md)" cites only its address in "sources\[\]"$/u,
    run(world, slug, rel) {
      // AGSC-08-31: a text a model wrote cannot ground another, so the address of this item is not a counted source.
      world.write(`content/concepts/${slug}.md`, ['---', 'type: concept', 'kind: term', `title: ${slug}`,
        'description: A note a model wrote, which the minimum-sources check does not count as a source.',
        'tags:', '  - agents', 'clusters:', '  - agent-patterns',
        'prov:', '  origin: ai-generated', '  agent: note-writer', '  model: example-model-1', '  operator: human:andreibesleaga',
        '---', '', '## Intent', '', 'Text.', ''].join('\n'));
      const base = JSON.parse(world.read('agsc.config.json')).site.base;
      world.write(rel, world.read(rel).replace(/\n---\n/u, `\nsources:\n  - resource: ${base}concepts/${slug}/\n---\n`));
    },
  },
  {
    pattern: /^the "(AGSC-E\d{3})" warnings name exactly ((?:"[^"]+"(?:, | and )?)+) \(AGSC-08-31\)$/u,
    run(world, code, list) {
      const files = [...list.matchAll(/"([^"]+)"/gu)].map((m) => m[1]);
      const found = world.json().findings.filter((f) => f.code === code);
      assert.ok(found.every((f) => f.severity === 'warn'), JSON.stringify(found));
      assert.deepStrictEqual(found.map((f) => f.file).sort(), [...files].sort(), world.last.stdout);
    },
  },
];
