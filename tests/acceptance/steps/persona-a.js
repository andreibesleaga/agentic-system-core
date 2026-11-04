'use strict';
/* global document */
// verifies AGSC-02-13, AGSC-03-04, AGSC-06-02, AGSC-06-16, AGSC-06-22, AGSC-06-25, AGSC-06-30, AGSC-06-38
// Steps of features/persona-a-reader.feature. Offline: the pages a reader opens are
// read from the build output of the acceptance Bundle, which stands in for the
// deployed site (the same bytes a host serves from `www/`). In a browser
// (`_browser.js`): the reader searches on the served `/search/` page, and every
// request the page makes is recorded.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, built, splitItem } = require('./_world.js');
const { RELATIONS } = require('../../../src/knowledge/relations.js');
const browser = require('./_browser.js');

const BASE = 'https://agenticsystemcore.com/';
const DRAFT = 'content/concepts/unreleased-idea.md';
const ALT = 'Two agents of two organisations exchange a task through an agent card.';
const RELATIONS_MEANING_REQUIRES = RELATIONS.find((r) => r.key === 'requires').meaning;

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

/** The rows of a page's relations table under `anchor`, each as its cells without markup. */
function relationRows(html, anchor) {
  const at = html.indexOf(`id="${anchor}"`);
  assert.ok(at >= 0, `the page has no #${anchor} section`);
  const table = html.slice(html.indexOf('<table class="relations">', at), html.indexOf('</table>', at));
  return [...table.matchAll(/<tr>(.*?)<\/tr>/gu)].slice(1)
    .map((m) => [...m[1].matchAll(/<td>(.*?)<\/td>/gu)].map((c) => c[1].replace(/<[^>]+>/gu, '')));
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
      // The author's diagram: its ids carry the item's slug (the graph view's figure is `links_a2a`).
      const svg = /<svg\b([^>]*aria-labelledby="a2a-title[^>]*)>([\s\S]*?)<\/svg>/u.exec(main);
      assert.ok(svg, 'no inline <svg> of the author\'s diagram on the page');
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
      const line = /^content version \S+, built at 2026-01-01T00:00:00Z, fingerprint [0-9a-f]{64}, specification 1\.0\.0$/mu;
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
  {
    pattern: 'no server-side search endpoint exists',
    run(world) {
      // The node is static files: the search page, the index it reads, and no
      // function, worker or rewrite a host could answer a query with.
      assert.ok(world.exists('www/search/index.html') && world.exists('www/search.json'));
      const files = [...world.snapshot('www').keys()];
      assert.deepStrictEqual(files.filter((f) => /^(functions\/|_worker\.js$|_routes\.json$)/u.test(f)), []);
      assert.doesNotMatch(world.read('www/_redirects'), /search/u);
    },
  },
  {
    pattern: 'the reader types a query into the search box',
    async run(world) {
      const opened = await browser.open(world, '/search/');
      await opened.page.waitForSelector('#search-form:not([hidden])', { timeout: 10000 });
      await opened.page.click('#q');
      await opened.page.keyboard.type('handoff');
      await opened.page.keyboard.press('Enter');
      await opened.page.waitForSelector('#results li a', { timeout: 10000 });
      world.state.search = opened;
    },
  },
  {
    pattern: 'the browser fetches "/search.json" once',
    run(world) {
      const { origin, requests } = world.state.search;
      assert.deepStrictEqual(requests.filter((u) => u.split('?')[0] === `${origin}/search.json`), [`${origin}/search.json`]);
    },
  },
  {
    pattern: 'results are filtered client-side from the fetched inverted index',
    async run(world) {
      const { origin, page, requests } = world.state.search;
      const hrefs = () => page.evaluate(() => [...document.querySelectorAll('#results li a')].map((a) => a.getAttribute('href')));
      assert.ok((await hrefs()).includes('/concepts/handoff/'), JSON.stringify(await hrefs()));
      // A second query is answered from the index already in the page: no request at all.
      const before = requests.length;
      await page.fill('#q', 'supervisor');
      await page.waitForFunction(() => [...document.querySelectorAll('#results li a')]
        .some((a) => a.getAttribute('href') === '/concepts/supervisor/'), null, { timeout: 10000 });
      assert.deepStrictEqual(requests.slice(before), [], 'the second query made a request');
      // The query never left the page: no request carried it.
      assert.deepStrictEqual(requests.filter((u) => /handoff|supervisor/u.test(u.slice(origin.length))), []);
    },
  },
  {
    pattern: 'no network request is made to any third-party search service',
    run(world) {
      assert.deepStrictEqual(world.state.search.offOrigin, [], 'the page requested another origin');
      assert.deepStrictEqual(world.state.search.errors, [], 'the page logged errors');
    },
  },
  {
    pattern: 'the draft "unreleased-idea" also requires "mcp" and the Bundle is built again',
    run(world) {
      world.write(DRAFT, world.read(DRAFT).replace('kind: pattern\n', 'kind: pattern\nrequires:\n  - mcp\n'));
      built(world);
    },
  },
  {
    pattern: 'the reader navigates to "/concepts/mcp/"',
    run(world) {
      world.state.page = world.read('www/concepts/mcp/index.html');
    },
  },
  {
    pattern: 'the relations table lists the backlink "requires" from "Agent2Agent Protocol" with the meaning of "requires" (AGSC-06-38)',
    run(world) {
      const meaning = RELATIONS.find((r) => r.key === 'requires').meaning;
      assert.deepStrictEqual(relationRows(world.state.page, 'links'), [['requires', 'incoming', 'Agent2Agent Protocol', meaning]]);
      assert.match(world.state.page, /<td><a href="\/concepts\/a2a\/">Agent2Agent Protocol<\/a><\/td>/u);
    },
  },
  {
    pattern: 'the figure beside the table draws exactly the rows of the table and is named by its title and description',
    run(world) {
      const html = world.state.page;
      const svg = /<svg[\s\S]*?<\/svg>/u.exec(html.slice(html.indexOf('id="links"')))[0];
      assert.strictEqual((svg.match(/marker-end=/gu) || []).length, relationRows(html, 'links').length, 'one arrow per row');
      assert.match(svg, /role="img" aria-labelledby="links_mcp-title links_mcp-desc"/u);
      assert.match(svg, /<title id="links_mcp-title">Relations of Model Context Protocol<\/title>/u);
      assert.match(svg, />Agent2Agent Protocol<\/text>/u);
    },
  },
  {
    pattern: 'each arrow of the figure carries the class of its relation, "agsc-rel-requires" for the backlink, and no colour (AGSC-01-42)',
    run(world) {
      const html = world.state.page;
      const svg = /<svg[\s\S]*?<\/svg>/u.exec(html.slice(html.indexOf('id="links"')))[0];
      const arrows = [...svg.matchAll(/<path [^>]*marker-end=[^>]*>/gu)].map((m) => m[0]);
      const classes = arrows.map((a) => (/class="agsc-rel-([a-z-]+)"/u.exec(a) || [])[1]);
      assert.deepStrictEqual(classes, relationRows(html, 'links').map((row) => row[0]), 'one class per arrow, the key of its row');
      assert.ok(classes.includes('requires'), 'the backlink from Agent2Agent Protocol');
      assert.doesNotMatch(svg, /fill="#|stroke="#|style=/u, 'the class carries no colour');
    },
  },
  {
    pattern: 'the draft "unreleased-idea" is neither drawn nor named on the page',
    run(world) {
      assert.ok(!world.state.page.includes('unreleased-idea') && !world.state.page.includes('Unreleased idea'), 'the page names the draft');
    },
  },
  {
    pattern: 'the reader navigates to "/clusters/agent-patterns/"',
    run(world) {
      world.state.page = world.read('www/clusters/agent-patterns/index.html');
    },
  },
  {
    pattern: 'the cluster map draws the link "requires" from "Handoff" to "Supervisor" and its table lists the same link',
    run(world) {
      const html = world.state.page;
      const meaning = RELATIONS.find((r) => r.key === 'requires').meaning;
      assert.deepStrictEqual(relationRows(html, 'member_links'), [['Handoff', 'requires', 'Supervisor', meaning]]);
      const svg = /<svg[\s\S]*?<\/svg>/u.exec(html.slice(html.indexOf('id="member_links"')))[0];
      assert.match(svg, />Handoff<\/text>/u);
      assert.match(svg, />Supervisor<\/text>/u);
      assert.match(svg, />requires<\/text>/u);
      assert.strictEqual((svg.match(/marker-end=/gu) || []).length, 1, 'one arc');
    },
  },
  {
    pattern: 'the concept "handoff" also uses "mcp" and the Bundle is built again',
    run(world) {
      const file = 'content/concepts/handoff.md';
      world.write(file, world.read(file).replace('---\n', '---\nuses:\n  - mcp\n'));
      built(world);
    },
  },
  {
    pattern: 'the reader navigates to "/clusters/"',
    run(world) {
      world.state.page = world.read('www/clusters/index.html');
    },
  },
  {
    pattern: 'the overview table counts the relation "uses" from "Agent patterns" to "Protocols", and its figure draws the same arc (AGSC-06-38)',
    run(world) {
      const html = world.state.page;
      const at = html.indexOf('id="overview"');
      assert.ok(at >= 0, 'the page has no overview');
      const table = html.slice(html.indexOf('<table class="relations">', at), html.indexOf('</table>', at));
      const rows = [...table.matchAll(/<tr data-relation="([a-z-]+)">(.*?)<\/tr>/gu)]
        .map((m) => [m[1], ...[...m[2].matchAll(/<td>(.*?)<\/td>/gu)].map((c) => c[1].replace(/<[^>]+>/gu, ''))]);
      const meaning = RELATIONS.find((r) => r.key === 'uses').meaning;
      assert.ok(rows.some((r) => JSON.stringify(r) === JSON.stringify(['uses', 'Agent patterns', 'uses', 'Protocols', '1', meaning])), JSON.stringify(rows));
      const svg = /<svg[\s\S]*?<\/svg>/u.exec(html.slice(at))[0];
      assert.match(svg, />Agent patterns<\/text>/u);
      assert.match(svg, />Protocols<\/text>/u);
      assert.match(svg, />uses<\/text>/u);
      assert.strictEqual((svg.match(/marker-end=/gu) || []).length, new Set(rows.map((r) => `${r[1]}>${r[3]}`)).size, 'one arc per pair of clusters');
    },
  },
  {
    pattern: 'a radio button for each relation in the table filters it through the page\'s own stylesheet, with no script',
    run(world) {
      const html = world.state.page;
      const keys = [...new Set([...html.matchAll(/<tr data-relation="([a-z-]+)">/gu)].map((m) => m[1]))];
      const radios = [...html.matchAll(/<input type="radio" name="relation-filter" id="relation-filter-([a-z-]+)"/gu)].map((m) => m[1]);
      assert.deepStrictEqual(radios, ['all', ...keys]);
      const sheet = /<link rel="stylesheet" href="(\/clusters\/[a-z-]+\.css)">/u.exec(html);
      assert.ok(sheet, 'the page loads no stylesheet of its own');
      const css = world.read(`www${sheet[1]}`);
      for (const key of keys) {
        assert.ok(css.includes(`:has(#relation-filter-${key}:checked) ~ .table-wrap tr[data-relation]:not([data-relation="${key}"]) { display: none; }`), key);
      }
      // The filter is markup and rules only: the overview carries no script.
      const overview = html.slice(html.indexOf('id="overview"'), html.indexOf('id="legend"'));
      assert.doesNotMatch(overview, /<script|\son[a-z]+=/u);
    },
  },
  {
    pattern: 'the legend lists the fourteen relations in the order of AGSC-03-01, each with its meaning',
    run(world) {
      const html = world.state.page;
      const legend = html.slice(html.indexOf('id="legend"'), html.indexOf('</table>', html.indexOf('id="legend"')));
      const rows = [...legend.matchAll(/<tr><td>(.*?)<\/td><td>.*?<\/td><td>(.*?)<\/td><\/tr>/gu)].map((m) => [m[1], m[2]]);
      assert.deepStrictEqual(rows, RELATIONS.map((r) => [r.key, r.meaning]));
    },
  },
  {
    pattern: 'the reader opens the explorer on "/clusters/"',
    async run(world) {
      const opened = await browser.open(world, '/clusters/');
      await opened.page.waitForSelector('#explorer[data-state="ready"]', { timeout: 15000 });
      world.state.explorer = opened;
    },
  },
  {
    pattern: 'the concept "tool-use-retries" is retired and the Bundle is built again',
    run(world) {
      const file = 'content/concepts/tool-use-retries.md';
      world.write(file, world.read(file).replace('kind: pattern\n', 'kind: pattern\nstatus: retired\n'));
      built(world);
    },
  },
  {
    pattern: 'the explorer draws every listed item and not the retired "tool-use-retries", and the page requests nothing from another origin',
    async run(world) {
      const { errors, offOrigin, page } = world.state.explorer;
      // The listed items (AGSC-00-05) are those of `search.json` (AGSC-06-30); each one's
      // IRI is the graph entry whose address ends in its slug. The graph file itself also
      // keeps the retired item (AGSC-11-22), which must not be drawn.
      const listed = new Set(JSON.parse(world.read('www/search.json')).docs.map((d) => d.slug));
      const graph = JSON.parse(world.read('www/graph.jsonld'))['@graph'];
      assert.ok(graph.some((n) => n['@id'] === `${BASE}concepts/tool-use-retries/`), 'the graph file lost the retired item');
      const items = graph.filter((n) => {
        const id = String(n['@id']);
        const m = /^[a-z]+\/([a-z0-9-]+)\/$/u.exec(id.startsWith(BASE) ? id.slice(BASE.length) : '');
        return m !== null && listed.has(m[1]);
      });
      const drawn = await page.evaluate(() => [...document.querySelectorAll('#explorer-picture circle')].map((c) => c.getAttribute('data-id')));
      assert.deepStrictEqual([...drawn].sort(), items.map((n) => n['@id']).sort());
      assert.strictEqual(items.length, listed.size, 'a listed item has no graph entry');
      assert.ok(!drawn.some((id) => id.includes('unreleased-idea')), 'the explorer draws a draft');
      assert.ok(!drawn.some((id) => id.includes('tool-use-retries')), 'the explorer draws the retired item');
      assert.deepStrictEqual(offOrigin, []);
      assert.deepStrictEqual(errors, []);
    },
  },
  {
    pattern: 'the arrow keys move through the explorer\'s list with the tooltip following, and Enter selects an item whose relations the detail panel names with their meanings',
    async run(world) {
      const { page } = world.state.explorer;
      await page.focus('#explorer-items button[tabindex="0"]');
      await page.keyboard.press('ArrowDown');
      const state = () => page.evaluate(() => ({
        described: (document.querySelector('[aria-describedby="explorer-tip"]') || { id: '' }).getAttribute('data-id'),
        focused: document.activeElement.getAttribute('data-id'),
      }));
      const moved = await state();
      assert.ok(moved.focused && moved.focused === moved.described, JSON.stringify(moved));
      // Move to Handoff, which requires Supervisor, and select it.
      const order = await page.evaluate(() => [...document.querySelectorAll('#explorer-items button[data-id]')].map((b) => b.firstChild.textContent));
      for (let i = order.indexOf(order[1]); i < order.indexOf('Handoff'); i += 1) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      const detail = await page.evaluate(() => document.getElementById('explorer-detail').textContent);
      assert.match(detail, /^Handoff/u);
      assert.ok(detail.includes('requires') && detail.includes('Supervisor'), detail);
      assert.ok(detail.includes(RELATIONS_MEANING_REQUIRES), 'the meaning of "requires" is not shown');
    },
  },
  {
    pattern: 'Escape closes the tooltip first and then clears the selection',
    async run(world) {
      const { page } = world.state.explorer;
      await page.keyboard.press('ArrowDown');
      const look = () => page.evaluate(() => ({
        selected: document.querySelectorAll('#explorer-picture circle.is-selected').length,
        tip: !document.getElementById('explorer-tip').hidden,
      }));
      assert.deepStrictEqual(await look(), { selected: 1, tip: true });
      await page.keyboard.press('Escape');
      assert.deepStrictEqual(await look(), { selected: 1, tip: false });
      await page.keyboard.press('Escape');
      assert.deepStrictEqual(await look(), { selected: 0, tip: false });
    },
  },
  {
    pattern: 'the reader opens the query page "/query/"',
    async run(world) {
      const opened = await browser.open(world, '/query/', { acceptDownloads: true });
      await opened.page.waitForSelector('#query[data-state="ready"]', { timeout: 20000 });
      world.state.query = opened;
    },
  },
  {
    pattern: 'the page loads the node\'s own graph into the engine it ships and requests nothing from another origin',
    async run(world) {
      const { errors, offOrigin, page } = world.state.query;
      const quads = world.read('www/graph.nq').split('\n').filter((line) => line.trim() !== '').length;
      assert.match(await page.textContent('#query-status'), new RegExp(`^The graph is loaded: ${quads} statements\\.`, 'u'));
      assert.deepStrictEqual(offOrigin, []);
      assert.deepStrictEqual(errors, []);
    },
  },
  {
    pattern: 'a CONSTRUCT query for the "requires" links shows "Handoff" requiring "Supervisor" as a table and as a picture, with the result offered as CSV and as JSON',
    async run(world) {
      const { page } = world.state.query;
      await page.fill('#query-text', 'PREFIX dcterms: <http://purl.org/dc/terms/>\nCONSTRUCT { ?a dcterms:requires ?b } WHERE { ?a dcterms:requires ?b }');
      await page.click('#query-run');
      await page.waitForSelector('#query[data-result="answered"]', { timeout: 20000 });
      const rows = await page.evaluate(() => [...document.querySelectorAll('#query-table tbody tr')].map((tr) => tr.textContent));
      assert.ok(rows.includes(`<${BASE}concepts/handoff/>dcterms:requires<${BASE}concepts/supervisor/>`), JSON.stringify(rows));
      assert.ok(await page.locator('#query-picture line.rel-requires').count() >= 1, 'the picture draws no requires link');
      const fileOf = async (selector) => {
        const [file] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
        return fs.readFileSync(await file.path(), 'utf8');
      };
      const csv = await fileOf('#query-csv');
      assert.ok(csv.startsWith('subject,predicate,object\r\n'), csv);
      assert.ok(csv.includes(`${BASE}concepts/handoff/,http://purl.org/dc/terms/requires,${BASE}concepts/supervisor/\r\n`), csv);
      assert.deepStrictEqual(JSON.parse(await fileOf('#query-json')).head.vars, ['subject', 'predicate', 'object']);
      world.state.queryText = await page.inputValue('#query-text');
    },
  },
  {
    pattern: 'the share link of that query opens it in the editor of a new page without running it, and no request carries the query',
    async run(world) {
      const href = await world.state.query.page.getAttribute('#query-share', 'href');
      assert.ok(href.startsWith('#query='), href);
      const opened = await browser.open(world, `/query/${href}`);
      await opened.page.waitForSelector('#query[data-state="ready"]', { timeout: 20000 });
      assert.strictEqual(await opened.page.inputValue('#query-text'), world.state.queryText);
      assert.strictEqual(await opened.page.getAttribute('#query', 'data-result'), null, 'the query of a link ran by itself');
      assert.ok(opened.requests.every((url) => !url.includes('CONSTRUCT') && !url.includes('requires')), JSON.stringify(opened.requests));
      assert.deepStrictEqual(opened.errors, []);
    },
  },
];
