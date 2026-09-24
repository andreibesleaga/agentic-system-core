'use strict';
// verifies AGSC-02-13, AGSC-03-04, AGSC-06-02, AGSC-06-22, AGSC-06-25, AGSC-06-30
// Steps of features/persona-a-reader.feature that run offline: the pages a reader
// opens are read from the build output of the acceptance Bundle, which stands in
// for the deployed site (the same bytes a host serves from `www/`).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, built, splitItem } = require('./_world.js');

const BASE = 'https://agenticsystemcore.com/';
const DRAFT = 'content/concepts/unreleased-idea.md';
const ALT = 'Two agents of two organisations exchange a task through an agent card.';

/** The `<main>` element of a built page. */
function mainOf(html) {
  const m = /<main[^>]*>([\s\S]*?)<\/main>/u.exec(html);
  assert.ok(m, 'the page has no <main>');
  return m[1];
}

/** Every href of an anchor, in document order. */
function hrefs(html) {
  return [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/gu)].map((m) => m[1]);
}

/** The published items of the fixture, read from its files: slug → frontmatter. */
function published(world) {
  const out = new Map();
  for (const folder of ['concepts', 'clusters', 'lessons']) {
    const dir = path.join(world.dir, 'content', folder);
    for (const name of fs.readdirSync(dir).sort()) {
      const { frontmatter } = splitItem(world.read(`content/${folder}/${name}`));
      if (frontmatter.status !== 'draft') out.set(name.replace(/\.md$/u, ''), { ...frontmatter, folder });
    }
  }
  return out;
}

module.exports = [
  {
    pattern: 'the acceptance Bundle is built into "www/" for the site "https://agenticsystemcore.com/"',
    run(world) {
      world.bundle();
      // The Concept the reader opens carries the evidence a published pattern
      // normally has: a verified source, the two facets and a compiled diagram.
      const a2a = world.read('content/concepts/a2a.md');
      world.write('content/concepts/a2a.md', a2a.replace('kind: pattern\n', [
        'sources:', '  - resource: https://a2a-protocol.org/latest/specification/',
        '    title: Agent2Agent Protocol Specification', '    verified: "2026-01-01"',
        'kind: pattern', 'evidence: explicit', 'maturity: emerging',
        'diagram:', '  file: a2a.svg', `  alt: ${ALT}`, ''].join('\n')));
      fs.mkdirSync(path.join(world.dir, 'content', 'diagrams'));
      fs.copyFileSync(path.join(ROOT, 'tests', 'fixtures', 'diagrams', 'a2a.diagram'),
        path.join(world.dir, 'content', 'diagrams', 'a2a.diagram'));
      world.write(DRAFT, ['---', 'type: concept', 'title: Unreleased idea',
        'description: A pattern still being written, which no reader should find on any published surface yet.',
        'status: draft', 'clusters:', '  - protocols', 'prov:', '  origin: human', '  operator: human:andreibesleaga',
        'kind: pattern', '---', '', '## Intent', '', 'Not ready.', ''].join('\n'));
      assert.strictEqual(JSON.parse(world.read('agsc.config.json')).site.base, BASE);
      built(world);
    },
  },
  {
    pattern: 'an item with "status: draft" stays dark: no page, no link, no index entry (AGSC-06-30)',
    run(world) {
      assert.ok(!world.exists('www/concepts/unreleased-idea/index.html'), 'the draft has a page');
      assert.ok(!world.exists('www/pages/unreleased-idea.md'), 'the draft has a Markdown view');
      for (const rel of ['www/index.html', 'www/concepts/index.html', 'www/clusters/protocols/index.html',
        'www/search.json', 'www/llms.txt', 'www/llms-full.txt', 'www/graph.jsonld', 'www/sitemap.xml',
        'www/chunks.jsonl', 'www/skills/protocols/SKILL.md']) {
        assert.ok(!world.read(rel).includes('unreleased-idea'), `${rel} names the draft`);
      }
    },
  },
  {
    pattern: 'the reader opens "/"',
    run(world) {
      world.state.page = world.read('www/index.html');
    },
  },
  {
    pattern: 'the page shows the Bundle\'s title and the summary of "content/index.md"',
    run(world) {
      const { frontmatter } = splitItem(world.read('content/index.md'));
      const main = mainOf(world.state.page);
      assert.match(main, new RegExp(`<h1>${frontmatter.title}</h1>`, 'u'));
      assert.ok(main.includes(frontmatter.description), 'the summary of content/index.md is not shown');
    },
  },
  {
    pattern: 'its head carries the "describedby" link to "/.well-known/knowledge-linkset" (AGSC-06-25)',
    run(world) {
      const head = /<head>([\s\S]*?)<\/head>/u.exec(world.state.page)[1];
      assert.ok(head.includes('<link rel="describedby" href="/.well-known/knowledge-linkset" type="application/linkset+json">'), head);
    },
  },
  {
    pattern: 'the page links to "/clusters/", "/concepts/", "/lessons/", "/skills/", "/now/", "/compose/" and "/search/"',
    run(world) {
      const links = new Set(hrefs(world.state.page));
      for (const route of ['/clusters/', '/concepts/', '/lessons/', '/skills/', '/now/', '/compose/', '/search/']) {
        assert.ok(links.has(route), `no link to ${route}`);
        assert.ok(world.exists(`www${route}index.html`), `${route} is linked and not emitted`);
      }
    },
  },
  {
    // The front page is short (owner, 2026-09-24): the index pages carry the lists.
    pattern: 'the page introduces the node and links each non-empty index page with its count, listing no item itself',
    run(world) {
      const main = mainOf(world.state.page);
      const items = published(world);
      const listed = hrefs(main).filter((h) => /^\/(concepts|clusters|lessons)\/[^/]+\/$/u.test(h));
      assert.deepStrictEqual(listed, [], 'the front page lists items');
      const folders = [...new Set([...items.values()].map((item) => item.folder))];
      for (const folder of folders) {
        const count = [...items.values()].filter((item) => item.folder === folder).length;
        assert.ok(main.includes(`href="/${folder}/"`), `no link to /${folder}/`);
        assert.ok(main.includes(`(${count})`), `no count for /${folder}/`);
      }
    },
  },
  {
    pattern: 'the page contains no "start here" link and no imposed reading order',
    run(world) {
      assert.doesNotMatch(world.state.page, /start here/iu);
      assert.doesNotMatch(world.state.page, /rel="(next|prev)"/u);
      assert.doesNotMatch(mainOf(world.state.page), /<ol\b/u, 'the home page numbers its items');
    },
  },
  {
    pattern: 'the reader navigates to "/concepts/a2a/"',
    run(world) {
      world.state.page = world.read('www/concepts/a2a/index.html');
    },
  },
  {
    pattern: 'the page shows the title, the description as its summary, the type and kind, the cluster "Protocols" and the provenance',
    run(world) {
      const main = mainOf(world.state.page);
      const { frontmatter } = splitItem(world.read('content/concepts/a2a.md'));
      assert.match(main, /<h1>Agent2Agent Protocol<\/h1>/u);
      assert.match(main, /<p class="summary">[\s\S]*?<\/p>/u);
      assert.ok(/<p class="summary">([\s\S]*?)<\/p>/u.exec(main)[1].includes(frontmatter.description));
      assert.ok(main.includes('concept · kind <code>pattern</code>'), 'type and kind are not shown');
      assert.ok(main.includes('<a href="/clusters/protocols/">Protocols</a>'), 'the cluster is not linked');
      assert.match(main, /Provenance<\/dt><dd>[^<]*\(origin <code>human<\/code>, operator <code>human:andreibesleaga<\/code>\)/u);
    },
  },
  {
    pattern: 'the page shows the SVG compiled from "content/diagrams/a2a.diagram" inline, named by "diagram.alt", and no diagram route exists (AGSC-02-13)',
    run(world) {
      const main = mainOf(world.state.page);
      const svg = /<svg\b([^>]*)>([\s\S]*?)<\/svg>/u.exec(main);
      assert.ok(svg, 'no inline <svg> on the page');
      assert.match(svg[1], /role="img"/u);
      const labelled = /aria-labelledby="([^"\s]+)/u.exec(svg[1])[1];
      assert.ok(svg[2].includes(`<title id="${labelled}">${ALT}</title>`), 'the accessible name is not diagram.alt');
      const everywhere = world.snapshot('www');
      assert.ok(![...everywhere.keys()].some((f) => f.endsWith('.svg')), 'a compiled diagram was emitted as a file');
      assert.ok(!world.read('www/sitemap.xml').includes('.svg'));
    },
  },
  {
    pattern: 'the page links its own "/pages/a2a.md" and "/pages/a2a.jsonld" (AGSC-06-02)',
    run(world) {
      const links = hrefs(mainOf(world.state.page));
      for (const view of ['/pages/a2a.md', '/pages/a2a.jsonld']) {
        assert.ok(links.includes(view), `the page does not link ${view}`);
        assert.ok(world.exists(`www${view}`), `${view} is not emitted`);
      }
    },
  },
  {
    pattern: 'the Markdown view carries the "sources" entries with their "verified" dates and the "evidence" and "maturity" facets',
    run(world) {
      const { frontmatter } = splitItem(world.read('www/pages/a2a.md'));
      assert.deepStrictEqual(frontmatter.sources.map((s) => [s.resource, String(s.verified)]),
        [['https://a2a-protocol.org/latest/specification/', '2026-01-01']]);
      assert.strictEqual(frontmatter.evidence, 'explicit');
      assert.strictEqual(frontmatter.maturity, 'emerging');
    },
  },
  {
    pattern: 'the graph carries the typed Link "requires" to "mcp" and its computed inverse on "mcp" (AGSC-03-04)',
    run(world) {
      const nodes = JSON.parse(world.read('www/graph.jsonld'))['@graph'];
      const node = (slug) => nodes.find((n) => n['@id'] === `${BASE}concepts/${slug}/`);
      assert.deepStrictEqual([].concat(node('a2a').requires), [`${BASE}concepts/mcp/`]);
      assert.deepStrictEqual([].concat(node('mcp').isRequiredBy), [`${BASE}concepts/a2a/`]);
      assert.ok(!('isRequiredBy' in splitItem(world.read('content/concepts/mcp.md')).frontmatter), 'the inverse was authored');
    },
  },
  {
    pattern: 'the page offers "Propose an edit" as a plain link to the forge\'s edit view of "content/concepts/a2a.md"',
    run(world) {
      const m = /<a href="([^"]+)"[^>]*>Propose an edit<\/a>/u.exec(mainOf(world.state.page));
      assert.ok(m, 'no "Propose an edit" link');
      assert.strictEqual(m[1], 'https://github.com/andreibesleaga/AgenticSystemCore.com/edit/HEAD/content/concepts/a2a.md');
      assert.doesNotMatch(m[0], /\bon[a-z]+=/u);
    },
  },
  {
    pattern: 'the reader navigates to "/clusters/protocols/"',
    run(world) {
      world.state.page = world.read('www/clusters/protocols/index.html');
    },
  },
  {
    pattern: 'the page lists every published item that names the cluster, each with its description',
    run(world) {
      const main = mainOf(world.state.page);
      const members = [...published(world)].filter(([, fm]) => (fm.clusters || []).includes('protocols'));
      assert.deepStrictEqual(members.map(([slug]) => slug), ['a2a', 'mcp']);
      const links = hrefs(main);
      for (const [slug, fm] of members) {
        assert.ok(links.includes(`/concepts/${slug}/`), `${slug} is not listed`);
        assert.ok(main.includes(fm.description), `${slug} is listed without its description`);
      }
    },
  },
  {
    pattern: 'the reader navigates to "/now/"',
    run(world) {
      world.state.nowHtml = world.read('www/now/index.html');
      world.state.nowMd = world.read('www/now.md');
    },
  },
  {
    pattern: '"/now/" and "/now.md" carry the line "content version …, built at …, fingerprint …, specification …" (AGSC-06-22)',
    run(world) {
      const line = /^content version \S+, built at 2026-01-01T00:00:00Z, fingerprint [0-9a-f]{64}, specification 1\.0\.0-rc\.6$/mu;
      const md = line.exec(world.state.nowMd);
      assert.ok(md, world.state.nowMd);
      assert.ok(world.state.nowHtml.includes(`<p>${md[0]}</p>`), 'the HTML page does not carry the same line');
    },
  },
  {
    pattern: 'they show the item counts, the stale item "tool-use-retries" and the open Lesson',
    run(world) {
      const now = world.state.nowMd;
      for (const [name, n] of [['clusters', 2], ['concepts', 5], ['lessons', 1], ['procedures', 0]]) {
        assert.match(now, new RegExp(`^- ${name}: ${n}$`, 'mu'), `${name} is not counted as ${n}`);
      }
      const section = (title) => (new RegExp(`## ${title}\\n\\n([\\s\\S]*?)(?:\\n## |$)`, 'u').exec(now) || [])[1] || '';
      assert.match(section('Stale items'), /tool-use-retries/u);
      assert.match(section('Open lessons'), /record-why-a-handoff-happened/u);
      for (const text of ['tool-use-retries', 'record-why-a-handoff-happened']) {
        assert.ok(world.state.nowHtml.includes(text), `/now/ does not show ${text}`);
      }
    },
  },
  {
    pattern: 'both were generated purely from stored state, with no hand edit surviving a rebuild',
    run(world) {
      world.write('www/now.md', `${world.state.nowMd}\nA hand-written line.\n`);
      world.write('www/now/index.html', world.state.nowHtml.replace('</main>', '<p>A hand-written line.</p></main>'));
      built(world);
      assert.strictEqual(world.read('www/now.md'), world.state.nowMd);
      assert.strictEqual(world.read('www/now/index.html'), world.state.nowHtml);
    },
  },
];
