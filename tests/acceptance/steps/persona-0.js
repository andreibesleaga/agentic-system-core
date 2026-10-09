'use strict';
// verifies AGSC-02-90, AGSC-02-91, AGSC-02-92, AGSC-02-93, AGSC-02-95, AGSC-08-10
// Steps of features/persona-0-dropin.feature that run offline: a folder of bare
// notes adopted by the real `init`, repaired by the publisher, passed by `ci`,
// built, served by the real local MCP server, and published locally through the
// real `agsc-host` (the reference hosting profile, then `serve` on loopback). The
// steps of the scenarios that wait on a gap are written here too: non-ASCII file
// names, the help a newcomer asks for, a stray `AGSC_` variable, an old Node.js
// and the security contact the agent skill teaches.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { spawnSync } = require('node:child_process');

const { HOST, AGSC, ROOT, built, splitItem } = require('./_world.js');

/** The notes of the drop-in user, as they were before `init` touched them. */
const NOTES = Object.freeze({
  'ideas.md': '# Ideas\n\nSee [the agents note](notes/agents.md) and ![a sketch](img/sketch.png).\n',
  'notes/agents.md': '# Agents\n\nAn agent is a program that acts for a person.\n',
  'todo.md': 'Buy milk.\n',
});
const KEPT = '---\ntitle: Kept as written\n---\n\nThis note already had frontmatter.\n';
const SKETCH = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);
const ADOPTED = Object.freeze({ 'ideas.md': 'ideas', 'notes/agents.md': 'agents', 'todo.md': 'todo' });

/** The two names AGSC-02-91 must lower-case as ASCII only: U+212A and U+0130. */
const KELVIN = '\u212Aelvin.md';
const ISTANBUL = '\u0130stanbul.md';
/** The closed verb list of AGSC-09-07, written out here rather than read from the engine. */
const VERBS = Object.freeze(['init', 'lint', 'build', 'verify', 'ci', 'export', 'import', 'compose',
  'propose', 'review', 'refresh', 'skills', 'mcp', 'run', 'trace', 'conform']);

const findingsOf = (r) => `${r.stdout}${r.stderr}`;
const errorLines = (r) => findingsOf(r).split('\n').filter((l) => /^error: /u.test(l));

const STEPS = [
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

/** Run one of the steps above by its text, so a later Given can replay them. */
async function replay(world, text) {
  const step = STEPS.find((d) => d.pattern === text);
  assert.ok(step, `no step "${text}"`);
  await step.run(world);
}

/** Every file under `content/`, and the item files under `content/concepts/`. */
const contentOf = (world) => world.snapshot('content');

STEPS.push(
  {
    pattern: 'a folder of bare notes adopted by "npx agentic-system-core init", repaired, and built into "www/"',
    async run(world) {
      for (const text of [
        'a directory containing "ideas.md", "notes/agents.md" and "todo.md" with no YAML frontmatter, and "kept.md" with a frontmatter block',
        'I run "npx agentic-system-core init"',
        'I add ".well-known/security.txt" with a "Contact:" line and repair the references "AGSC-E507" named',
        'I run "npx agentic-system-core ci"',
        'ci passes offline with warnings only and writes its verdict to "dist/gate.json" (AGSC-02-92, AGSC-08-10)',
        'I run "npx agentic-system-core build"',
      ]) await replay(world, text);
      // What a second init must not adopt: the build output (www/now.md, www/pages/*.md),
      // the generated dist/ and the Markdown copy init itself put under content/assets/.
      assert.ok(world.exists('www/now.md') && world.exists('www/pages/agents.md'));
      assert.ok(world.exists('dist/gate.json'));
      assert.ok(world.exists('content/assets/notes/agents.md'));
      world.state.before = contentOf(world);
      world.state.outside = new Map([...world.snapshot()].filter(([rel]) => !rel.startsWith('content/')));
    },
  },
  {
    pattern: 'I run "npx agentic-system-core init" again',
    run(world) {
      world.state.again = world.agsc(['init'], { offline: true });
      assert.strictEqual(world.state.again.exit, 0, findingsOf(world.state.again));
    },
  },
  {
    pattern: 'no file under "content/" changes and nothing under "www/", "dist/" or "content/assets/" is adopted (AGSC-02-91)',
    run(world) {
      const after = contentOf(world);
      assert.deepStrictEqual([...after.keys()], [...world.state.before.keys()], 'a file under content/ was added or removed');
      for (const [rel, bytes] of after) assert.strictEqual(bytes, world.state.before.get(rel), `content/${rel} changed`);
      // Nothing was moved out of www/ or dist/ either: an adopted file is MOVED (AGSC-02-93).
      const now = world.snapshot();
      for (const [rel, bytes] of world.state.outside) {
        assert.ok(now.has(rel), `${rel} was moved away`);
        assert.strictEqual(now.get(rel), bytes, `${rel} changed`);
      }
      assert.doesNotMatch(findingsOf(world.state.again), /^wrote: /mu, 'the second init wrote a file');
    },
  },
);

STEPS.push(
  {
    pattern: 'I run "agsc-host emit cloudflare-pages"',
    run(world) {
      const r = spawnSync(process.execPath, [HOST, 'emit', 'cloudflare-pages', '--json'], {
        cwd: world.dir, encoding: 'utf8', env: world.offlineEnv(),
      });
      world.last = { argv: ['emit', 'cloudflare-pages'], exit: r.status, stderr: r.stderr, stdout: r.stdout };
      assert.strictEqual(r.status, 0, findingsOf(world.last));
    },
  },
  {
    pattern: 'the host claims the reference profile, whose "_headers" and "_redirects" the build already wrote into "www/"',
    run(world) {
      const emitted = world.json();
      assert.strictEqual(emitted.status, 'pass');
      assert.strictEqual(emitted.profile, 'cloudflare-pages');
      assert.match(emitted.claim, /the reference profile/u);
      // The reference profile adds nothing: its two host files are part of every build.
      assert.deepStrictEqual(emitted.written, []);
      assert.ok(world.exists('www/_headers') && world.exists('www/_redirects'));
      assert.match(world.read('www/_headers'), /\/\.well-known\/knowledge-linkset/u);
    },
  },
  {
    pattern: 'a directory of bare notes named with the Kelvin sign U+212A, as in "Kelvin.md", and with the capital I with dot above U+0130, as in "Istanbul.md"',
    run(world) {
      world.dir = world.temp('agsc-acc-names-');
      world.write(KELVIN, '# Kelvin\n\nA note whose file name starts with the Kelvin sign.\n');
      world.write(ISTANBUL, '# Istanbul\n\nA note whose file name starts with a capital I with a dot above.\n');
      assert.deepStrictEqual(fs.readdirSync(world.dir).sort(), [KELVIN, ISTANBUL].sort());
    },
  },
  {
    pattern: 'the note named with U+212A becomes "content/concepts/kelvin.md", because NFC turns the Kelvin sign into the letter K before the ASCII lower-casing (AGSC-02-91)',
    run(world) {
      assert.ok(world.exists('content/concepts/kelvin.md'), fs.readdirSync(path.join(world.dir, 'content', 'concepts')).join(', '));
    },
  },
  {
    pattern: 'the note named with U+0130 becomes "content/concepts/stanbul.md", because only A to Z are lower-cased and every other character becomes "-" (AGSC-02-91)',
    run(world) {
      const slugs = fs.readdirSync(path.join(world.dir, 'content', 'concepts')).sort();
      assert.deepStrictEqual(slugs, ['kelvin.md', 'stanbul.md']);
      for (const name of slugs) assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u);
    },
  },
  {
    pattern: 'each adopted file records its original file name in "aliases" (AGSC-02-93)',
    run(world) {
      assert.deepStrictEqual(splitItem(world.read('content/concepts/kelvin.md')).frontmatter.aliases, [KELVIN]);
      assert.deepStrictEqual(splitItem(world.read('content/concepts/stanbul.md')).frontmatter.aliases, [ISTANBUL]);
    },
  },
  {
    pattern: 'an empty folder',
    run(world) {
      world.dir = world.temp('agsc-acc-empty-');
    },
  },
  {
    pattern: 'the help gives each of the sixteen verbs of AGSC-09-07 a line of its own with a sentence of purpose',
    run(world) {
      const lines = world.last.stdout.split('\n').map((l) => l.trim());
      for (const verb of VERBS) {
        // A line of its own: it starts with the verb, and what follows is a sentence,
        // not the next verbs of a list.
        const own = lines.filter((l) => l.split(/\s+/u)[0] === verb);
        assert.strictEqual(own.length, 1, `"${verb}" begins ${own.length} lines of agsc --help:\n${world.last.stdout}`);
        const rest = own[0].split(/\s+/u).slice(1);
        assert.ok(rest.length >= 3 && rest.some((word) => !VERBS.includes(word)),
          `the line of "${verb}" carries no sentence of purpose: ${own[0]}`);
      }
    },
  },
  {
    pattern: 'a folder of bare notes adopted by "npx agentic-system-core init"',
    run(world) {
      world.dir = world.temp('agsc-acc-notes-');
      world.write('ideas.md', '# Ideas\n\nAn agent is a program that acts for a person.\n');
      world.write('todo.md', 'Write the first note.\n');
      const init = world.agsc(['init'], { offline: true });
      assert.strictEqual(init.exit, 0, findingsOf(init));
      assert.ok(world.exists('content/concepts/ideas.md') && world.exists('agsc.config.json'));
    },
  },
  {
    pattern: /^the newcomer runs "agsc --version" on a Node\.js that reports "v(\d+\.\d+\.\d+)"$/u,
    run(world, version) {
      // An older Node.js, as the guard of the command line sees it: a preload that
      // makes this Node.js report another version before the entry point runs.
      const shim = path.join(world.home, 'old-node.js');
      fs.writeFileSync(shim, [
        `Object.defineProperty(process, 'version', { value: 'v${version}' });`,
        `Object.defineProperty(process.versions, 'node', { value: '${version}' });`, ''].join('\n'));
      const r = spawnSync(process.execPath, ['--require', shim, AGSC, '--version'], {
        cwd: world.dir, encoding: 'utf8', env: world.offlineEnv(),
      });
      world.last = { argv: ['--version'], exit: r.status, stderr: r.stderr, stdout: r.stdout };
    },
  },
  {
    pattern: 'the output is that one line, with no stack trace',
    run(world) {
      const text = findingsOf(world.last).trim();
      assert.ok(!text.includes('\n'), `more than one line:\n${text}`);
      assert.doesNotMatch(text, /^\s+at /mu);
    },
  },
  {
    pattern: 'the newcomer writes ".well-known/security.txt" exactly as the agent skill shows it',
    run(world) {
      // The block that follows the sentence naming `.well-known/security.txt` in the
      // skill's setup section, byte for byte (its indentation removed).
      const skill = fs.readFileSync(path.join(ROOT, 'skills', 'agentic-system-core', 'SKILL.md'), 'utf8');
      const after = skill.slice(skill.indexOf('written to `.well-known/security.txt`'));
      const block = /\n( *)```text\n([\s\S]*?)\n\1```/u.exec(after);
      assert.ok(block, 'the agent skill shows no security.txt block');
      const text = `${block[2].split('\n').map((l) => l.slice(block[1].length)).join('\n')}\n`;
      assert.match(text, /^Contact: /mu);
      world.write('.well-known/security.txt', text);
    },
  },
);

module.exports = STEPS;
