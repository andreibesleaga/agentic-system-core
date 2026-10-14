'use strict';
// verifies AGSC-06-28, AGSC-06-30
// Steps of features/persona-c-agent-mcp.feature that follow a chunk back to its page:
// an agent cites a chunk as the item IRI followed by `#chunk-` and the first 16 hex
// characters of its `id`, and the item page carries that anchor on the chunk's
// heading. A chunk that does not begin with a heading (chunk 0, a later piece of a
// long section, an attachment) is cited at the top of its page and has no anchor.
// The chunks are read from the build output the Background made; nothing is fetched.

const assert = require('node:assert');

/** The chunk lines of the build, parsed. */
function chunkLines(world) {
  return world.state.chunks.slice(0, -1).split('\n').map((l) => JSON.parse(l));
}

/** A chunk that begins with a heading: a named section, its first piece, text. */
function headed(chunk) {
  return chunk.section !== '' && chunk.ordinal === 0 && chunk.type === 'text';
}

module.exports = [
  {
    pattern: 'every chunk that begins with a heading is an in-page anchor "chunk-" and the first 16 hex characters of its "id" on that heading of its item page (AGSC-06-28)',
    run(world) {
      const lines = chunkLines(world).filter(headed);
      assert.ok(lines.length > 0, 'no chunk of the node begins with a heading');
      for (const c of lines) {
        const page = world.read(`www${new URL(c.iri).pathname}index.html`);
        const heading = new RegExp(`<(h[23]) id="${c.section}">([\\s\\S]*?)</\\1>`, 'u').exec(page);
        assert.ok(heading, `${c.item}: no heading "${c.section}" on its page`);
        assert.ok(heading[2].includes(`id="chunk-${c.id.slice(0, 16)}"`),
          `${c.item}#${c.section}: the heading carries no in-page anchor chunk-${c.id.slice(0, 16)}`);
      }
    },
  },
  {
    pattern: 'every other chunk is cited at the top of its page, and no page carries a chunk anchor that names no chunk (AGSC-06-30)',
    run(world) {
      const byPage = new Map();
      for (const c of chunkLines(world)) {
        const route = new URL(c.iri).pathname;
        if (!byPage.has(route)) byPage.set(route, []);
        if (headed(c)) byPage.get(route).push(c.id.slice(0, 16));
      }
      let pages = 0;
      for (const rel of world.snapshot('www').keys()) {
        if (!rel.endsWith('.html')) continue;
        const anchors = [...world.read(`www/${rel}`).matchAll(/id="chunk-([^"]*)"/gu)].map((m) => m[1]);
        const expected = byPage.get(`/${rel.replace(/index\.html$/u, '')}`) || [];
        assert.deepStrictEqual(anchors.sort(), [...expected].sort(), `/${rel}: its chunk anchors are not its headed chunks`);
        pages += 1;
      }
      assert.ok(pages > 0, 'the build has no page');
    },
  },
];
