'use strict';
// The "Never touches" column of docs/ARCHITECTURE-DDD.md §2, enforced. Each entry of
// the column is one phrase, and each phrase has a check below that reads the modules
// of that row's context (tests/arch/_code.js; nothing is executed). The table is
// read from the page itself, so a phrase added to the column without a check, or a
// context without its row, fails here: the page cannot say more than the code does.
//
// What each phrase means in code:
//
//   git                  no `child_process` (git is reached by spawning it, which
//                        only the process adapter does);
//   network              no socket, HTTP or DNS built-in (a global `fetch` is
//                        refused in every context by context-fitness.test.js);
//   review               nothing from `governance/`, where Proposals and Reviews live;
//   rendering            nothing from `distribution/`, and no Markdown renderer;
//   composition          nothing from `composition/`;
//   parsing              no parser library: the context reads through Knowledge's
//                        readers, which own parsing;
//   the file system …    no `fs`: the context writes only through the FileSystem
//                        port it is handed;
//   content semantics    none of Knowledge's readers of an item's content, and no
//                        parser library.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { builtinOf, requiresOf } = require('./_code.js');
const { ROOT, SRC, sources, contextOf } = require('./_scan.js');

const PAGE = path.join(ROOT, 'docs', 'ARCHITECTURE-DDD.md');

const NETWORK = ['net', 'http', 'https', 'http2', 'dns', 'tls', 'dgram'];
const PARSERS = ['yaml', 'markdown-it', 'n3', 'fast-xml-parser', 'jsonld'];
const CONTENT_READERS = ['frontmatter.js', 'yaml.js', 'markdown.js', 'links.js', 'chunks.js',
  'adopt.js', 'runblocks.js', 'diagrams.js'].map((name) => `knowledge/${name}`);

/** The `src/`-relative module a relative specifier resolves to, or null. */
function moduleOf(file, specifier) {
  if (!specifier.startsWith('.')) return null;
  return path.relative(SRC, path.resolve(path.dirname(file.absolute), specifier)).split(path.sep).join('/');
}

/** Phrase → a function from one required specifier to a fault text, or null. */
const CHECKS = Object.freeze({
  'git': (file, s) => (builtinOf(s) === 'child_process' ? 'spawns a process' : null),
  'network': (file, s) => (NETWORK.includes(builtinOf(s)) ? 'opens the network' : null),
  'review': (file, s) => (contextOf(file, s) === 'governance' ? 'reaches governance/' : null),
  'rendering': (file, s) => (contextOf(file, s) === 'distribution' || s === 'markdown-it' ? 'renders' : null),
  'composition': (file, s) => (contextOf(file, s) === 'composition' ? 'reaches composition/' : null),
  'parsing': (file, s) => (PARSERS.includes(s) ? 'loads a parser library' : null),
  'the file system (it writes only through the FileSystem port it is handed)':
    (file, s) => (builtinOf(s) === 'fs' ? 'touches the file system directly' : null),
  'content semantics': (file, s) => (PARSERS.includes(s) || CONTENT_READERS.includes(moduleOf(file, s))
    ? 'reads the content of an item' : null),
});

/** The rows of the §2 table: `{ context, phrases }`, the context as its `src/` folder. */
function rows() {
  const text = fs.readFileSync(PAGE, 'utf8');
  const start = text.indexOf('\n## 2.');
  const section = text.slice(start, text.indexOf('\n## 3.', start));
  const lines = section.split('\n').filter((l) => l.startsWith('|') && !/^\|[-| ]+\|$/u.test(l));
  const header = lines[0].split('|').map((c) => c.trim());
  const column = header.indexOf('Never touches');
  assert.ok(column > 0, 'docs/ARCHITECTURE-DDD.md §2 has no "Never touches" column');
  return lines.slice(1).map((line) => {
    const cells = line.split('|').map((c) => c.trim());
    const context = cells[1].replace(/[*]/gu, '').split(/\s/u)[0].toLowerCase();
    return { context, phrases: cells[column].split(', ').map((p) => p.trim()) };
  });
}

/** The faults of one phrase in one module. */
function faultsOf(phrase, file) {
  if (!Object.prototype.hasOwnProperty.call(CHECKS, phrase)) return [`${file.rel}: "${phrase}" has no check`];
  return requiresOf(file.text, file.rel).flatMap((s) => {
    const fault = CHECKS[phrase](file, s);
    return fault === null ? [] : [`${file.rel} ${fault} ("${s}"), which its context never touches (${phrase})`];
  });
}

/** A module that is not on disk, for the probes. */
function probe(rel, text) {
  return { absolute: path.join(ROOT, rel), rel, text };
}

test('every phrase of the "Never touches" column has a check, and every context has a row', () => {
  const table = rows();
  assert.deepStrictEqual(table.map((r) => r.context).sort(),
    ['boundary', 'composition', 'distribution', 'governance', 'interchange', 'knowledge']);
  for (const { context, phrases } of table) {
    for (const phrase of phrases) {
      assert.ok(Object.prototype.hasOwnProperty.call(CHECKS, phrase),
        `docs/ARCHITECTURE-DDD.md §2: "${phrase}" (${context}) has no check in this test`);
    }
  }
});

test('no context touches what its row says it never touches', () => {
  const faults = [];
  let modules = 0;
  for (const { context, phrases } of rows()) {
    const files = sources().filter((f) => f.dir.split('/')[0] === context);
    assert.ok(files.length > 0, `src/${context}/ holds no module`);
    modules += files.length;
    for (const file of files) for (const phrase of phrases) faults.push(...faultsOf(phrase, file));
  }
  assert.deepStrictEqual(faults, []);
  assert.ok(modules >= 50, `only ${modules} modules were read`);
});

test('each check refuses a module that breaks it', () => {
  const probes = [
    ['git', 'src/knowledge/probe.js', "const { spawnSync } = require('node:child_process');"],
    ['network', 'src/composition/probe.js', "const https = require('https');"],
    ['review', 'src/knowledge/probe.js', "const lint = require('../governance/lint.js');"],
    ['rendering', 'src/governance/probe.js', "const html = require('../distribution/html.js');"],
    ['rendering', 'src/interchange/probe.js', "const MarkdownIt = require('markdown-it');"],
    ['composition', 'src/interchange/probe.js', "const compose = require('../composition/compose.js');"],
    ['parsing', 'src/composition/probe.js', "const YAML = require('yaml');"],
    ['the file system (it writes only through the FileSystem port it is handed)',
      'src/distribution/probe.js', "const fs = require('node:fs'); // a trailing comment"],
    ['content semantics', 'src/boundary/probe.js', "const fm = require('../knowledge/frontmatter.js');"],
  ];
  assert.deepStrictEqual([...new Set(probes.map(([phrase]) => phrase))].sort(), Object.keys(CHECKS).sort());
  for (const [phrase, rel, text] of probes) {
    assert.strictEqual(faultsOf(phrase, probe(rel, text)).length, 1, `${phrase}: ${text}`);
  }
  // What the rows allow: Boundary's address classifier, Composition's reading through
  // Knowledge, Distribution's crypto, and a name in a comment.
  assert.deepStrictEqual(faultsOf('content semantics', probe('src/boundary/probe.js', "const net = require('node:net');")), []);
  assert.deepStrictEqual(faultsOf('parsing', probe('src/composition/probe.js', "const yaml = require('../knowledge/yaml.js');")), []);
  assert.deepStrictEqual(faultsOf('the file system (it writes only through the FileSystem port it is handed)',
    probe('src/distribution/probe.js', "const { createHash } = require('node:crypto'); // not require('node:fs')")), []);
});
