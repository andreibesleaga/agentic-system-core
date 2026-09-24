'use strict';
// verifies AGSC-02-90, AGSC-02-91, AGSC-02-92, AGSC-02-93, AGSC-02-95, AGSC-08-10
// Steps of features/persona-0-dropin.feature that run offline: a folder of bare
// notes adopted by the real `init`, repaired by the publisher, passed by `ci`,
// built, and served by the real local MCP server.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { built, splitItem } = require('./_world.js');

/** The notes of the drop-in user, as they were before `init` touched them. */
const NOTES = Object.freeze({
  'ideas.md': '# Ideas\n\nSee [the agents note](notes/agents.md) and ![a sketch](img/sketch.png).\n',
  'notes/agents.md': '# Agents\n\nAn agent is a program that acts for a person.\n',
  'todo.md': 'Buy milk.\n',
});
const KEPT = '---\ntitle: Kept as written\n---\n\nThis note already had frontmatter.\n';
const SKETCH = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);
const ADOPTED = Object.freeze({ 'ideas.md': 'ideas', 'notes/agents.md': 'agents', 'todo.md': 'todo' });

const findingsOf = (r) => `${r.stdout}${r.stderr}`;
const errorLines = (r) => findingsOf(r).split('\n').filter((l) => /^error: /u.test(l));

module.exports = [
  {
    pattern: 'a directory containing "ideas.md", "notes/agents.md" and "todo.md" with no YAML frontmatter, and "kept.md" with a frontmatter block',
    run(world) {
      world.dir = world.temp('agsc-acc-notes-');
      for (const [rel, text] of Object.entries(NOTES)) world.write(rel, text);
      world.write('kept.md', KEPT);
      fs.mkdirSync(path.join(world.dir, 'img'));
      fs.writeFileSync(path.join(world.dir, 'img', 'sketch.png'), SKETCH);
    },
  },
  {
    pattern: 'I run "npx agentic-system-core init"',
    run(world) {
      world.state.init = world.agsc(['init'], { offline: true });
      assert.strictEqual(world.state.init.exit, 0, findingsOf(world.state.init));
    },
  },
  {
    pattern: 'every adopted file gains exactly "type", "title", "aliases", "prov" and "kind", in that order, and every body byte is unchanged (AGSC-02-90)',
    run(world) {
      for (const [source, slug] of Object.entries(ADOPTED)) {
        const text = world.read(`content/concepts/${slug}.md`);
        const { frontmatter } = splitItem(text);
        assert.deepStrictEqual(Object.keys(frontmatter), ['type', 'title', 'aliases', 'prov', 'kind'], source);
        assert.strictEqual(frontmatter.type, 'concept');
        assert.strictEqual(frontmatter.kind, 'explainer');
        assert.strictEqual(frontmatter.prov.origin, 'human');
        // One blank line separates the block; every byte after it is the note's own.
        const close = text.indexOf('\n---\n', 3);
        assert.strictEqual(text.slice(close + 5), `\n${NOTES[source]}`, `${source}: the body changed`);
      }
      assert.strictEqual(splitItem(world.read('content/concepts/ideas.md')).frontmatter.title, 'Ideas',
        'the title comes from the first heading');
    },
  },
  {
    pattern: 'each adopted file is moved to "content/concepts/<slug>.md" with its original path recorded in "aliases" (AGSC-02-93)',
    run(world) {
      for (const [source, slug] of Object.entries(ADOPTED)) {
        assert.ok(!world.exists(source), `${source} was left in place`);
        assert.deepStrictEqual(splitItem(world.read(`content/concepts/${slug}.md`)).frontmatter.aliases, [source]);
      }
    },
  },
  {
    pattern: '"notes/agents.md" is flattened to "content/concepts/agents.md"',
    run(world) {
      assert.ok(world.exists('content/concepts/agents.md'));
      assert.ok(!world.exists('content/concepts/notes'), 'the nested folder was kept');
    },
  },
  {
    pattern: 'every relative link or image in an adopted body that no longer resolves is reported as warning "AGSC-E507" naming the original path, the new path and the reference, each referenced local file under the adoption root is copied to "content/assets/<original-relative-path>", and no body byte is rewritten (AGSC-02-95)',
    run(world) {
      const warnings = findingsOf(world.state.init).split('\n').filter((l) => /AGSC-E507/u.test(l));
      assert.strictEqual(warnings.length, 2, warnings.join('\n'));
      for (const reference of ['notes/agents.md', 'img/sketch.png']) {
        const line = warnings.find((l) => l.includes(`"${reference}"`));
        assert.ok(line, `no AGSC-E507 names ${reference}`);
        assert.match(line, /^warn: /u);
        assert.ok(line.includes('ideas.md') && line.includes('content/concepts/ideas.md'), line);
      }
      assert.strictEqual(world.read('content/assets/notes/agents.md'), NOTES['notes/agents.md']);
      assert.ok(fs.readFileSync(path.join(world.dir, 'content', 'assets', 'img', 'sketch.png')).equals(SKETCH),
        'the image was not copied byte for byte');
      assert.ok(world.read('content/concepts/ideas.md').endsWith(NOTES['ideas.md']), 'a reference was rewritten');
    },
  },
  {
    pattern: '"kept.md", which already had a frontmatter block, is untouched (AGSC-02-91)',
    run(world) {
      assert.strictEqual(world.read('kept.md'), KEPT);
    },
  },
  {
    pattern: 'init prints its two "before you build" steps, the security contact and the crawler list it wrote into "site.tdm_crawlers" (AGSC-02-92)',
    run(world) {
      const steps = world.state.init.stderr.split('\n').filter((l) => l.startsWith('before you build: '));
      assert.strictEqual(steps.length, 2, steps.join('\n'));
      assert.match(steps[0], /security\.txt/u);
      assert.match(steps[1], /site\.tdm_crawlers/u);
      const crawlers = JSON.parse(world.read('agsc.config.json')).site.tdm_crawlers;
      assert.ok(Array.isArray(crawlers) && crawlers.length > 0, 'init wrote no crawler list');
    },
  },
  {
    pattern: 'lint reports no error except the missing security contact "AGSC-E901" and the references "AGSC-E507" named, which stay "AGSC-E310" until repaired (AGSC-02-95)',
    run(world) {
      const lint = world.agsc(['lint'], { offline: true });
      assert.strictEqual(lint.exit, 1, findingsOf(lint));
      const errors = errorLines(lint);
      assert.strictEqual(errors.filter((l) => /AGSC-E901/u.test(l)).length, 1, errors.join('\n'));
      const broken = errors.filter((l) => /AGSC-E310/u.test(l));
      assert.deepStrictEqual(broken.map((l) => /"([^"]+)"/u.exec(l)[1]).sort(), ['img/sketch.png', 'notes/agents.md']);
      assert.strictEqual(errors.length, 3, `an adopted file produced another error:\n${errors.join('\n')}`);
    },
  },
  {
    pattern: 'I add ".well-known/security.txt" with a "Contact:" line and repair the references "AGSC-E507" named',
    run(world) {
      world.write('.well-known/security.txt', 'Contact: mailto:security@example.org\nExpires: 2027-01-01T00:00:00Z\n');
      // The note now sits in content/concepts/; its references are repaired to the
      // item it became and to the asset init copied (the publisher's edit, not init's).
      world.write('content/concepts/ideas.md', world.read('content/concepts/ideas.md')
        .replace('(notes/agents.md)', '(agents.md)')
        .replace('(img/sketch.png)', '(../assets/img/sketch.png)'));
    },
  },
  {
    pattern: 'I run "npx agentic-system-core ci"',
    run(world) {
      world.state.ci = world.agsc(['ci'], { offline: true });
    },
  },
  {
    pattern: 'ci passes offline with warnings only and writes its verdict to "dist/gate.json" (AGSC-02-92, AGSC-08-10)',
    run(world) {
      const { ci } = world.state;
      assert.strictEqual(ci.exit, 0, findingsOf(ci));
      assert.deepStrictEqual(errorLines(ci), []);
      assert.deepStrictEqual(world.networkAttempts(), []);
      const gate = JSON.parse(world.read('dist/gate.json'));
      assert.strictEqual(gate.status, 'pass');
      assert.strictEqual(gate.gate, 'ci');
    },
  },
  {
    pattern: 'I run "npx agentic-system-core build"',
    run(world) {
      built(world, { offline: true });
    },
  },
  {
    pattern: '"www/" contains the site, "graph.jsonld", "llms.txt" and "/.well-known/knowledge-linkset"',
    run(world) {
      for (const rel of ['www/index.html', 'www/concepts/ideas/index.html', 'www/concepts/agents/index.html',
        'www/graph.jsonld', 'www/llms.txt', 'www/.well-known/knowledge-linkset', 'www/assets/img/sketch.png']) {
        assert.ok(world.exists(rel), `${rel} was not emitted`);
      }
    },
  },
  {
    pattern: '"npx agentic-system-core mcp" serves search, read and links over the same files',
    async run(world) {
      const client = await world.mcp({ offline: true });
      const hits = (await client.callTool({ arguments: { query: 'agent' }, name: 'search' })).structuredContent;
      assert.strictEqual(hits.trust, 'untrusted');
      assert.ok(hits.body.hits.some((h) => h.slug === 'agents'), JSON.stringify(hits));
      const item = (await client.callTool({ arguments: { slug: 'ideas' }, name: 'read' })).structuredContent;
      assert.strictEqual(item.type, 'item');
      assert.strictEqual(item.body.frontmatter.aliases[0], 'ideas.md');
      const links = (await client.callTool({ arguments: { slug: 'agents' }, name: 'links' })).structuredContent;
      assert.strictEqual(links.type, 'links');
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
];
