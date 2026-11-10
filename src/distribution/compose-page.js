'use strict';
/**
 * CONTEXT Distribution (Emission) — Surface: the `/compose/` page.
 *
 * Implements AGSC-06-01's `/compose/` route, AGSC-07-01 ("It MUST NOT require a
 * network, a key or a server"), AGSC-07-13 (the combiner in the page is the CLI's
 * own algebra — `composition/browser.js` emits its source text), and the **per-file
 * download** plus a "Download all (.zip)" link from `composition/archive.js`,
 * AGSC-07-24 (`/compose/?from=<slug>` shows the same composition a saved
 * architecture names), AGSC-07-25 and AGSC-07-29 (the brief of the selection shown
 * inline and offered for download, with the blueprint outputs of a saved
 * architecture, in archives of their own beside the Harness archive) and AGSC-09-16
 * (the WebMCP tool registration, feature-detected, through `distribution/webmcp.js`).
 *
 * Three files are emitted beside the page, because AGSC-06-17's own policy —
 * `default-src 'none'; script-src 'self'; style-src 'self'` — admits no inline
 * script and no inline style: `agsc-core.js` (the algebra), `agsc-compose.js` (this
 * module's controller) and `webmcp.js` (the registration). They are same-origin
 * assets of one route, never routes of their own; the reading of AGSC-06-01's
 * "exactly this route set" that would forbid a page's own script is recorded as a
 * specification item rather than resolved here.
 *
 * The page reads only routes AGSC-06-01 already fixes: `/.well-known/knowledge-linkset`
 * for the node's base, build instant and content version (AGSC-06-08), `/graph.jsonld`
 * for the items (AGSC-05-16 read backwards, `composition/browser.js#itemsFromGraph`),
 * and `/pages/<slug>.md` (AGSC-06-02) for the body of a selected Procedure. The brief,
 * its downloads and the tag filter read the published pages the page tools already
 * read on this page (`AGSC_PAGE_TOOLS.corpus`), so nothing further is fetched. No
 * third-party origin, no cookie, no `localStorage`, no beacon (AGSC-06-05).
 *
 * Pure function of its input.
 */

const { manifest } = require('./mcp-tools.js');

/** The four same-origin assets of the `/compose/` route, in load order. */
const ASSETS = Object.freeze(['agsc-core.js', 'agsc-page-tools.js', 'agsc-compose.js', 'webmcp.js']);

/**
 * AGSC-09-16: the scripts an ITEM page loads, in load order — the algebra (which
 * `compose` and `brief` run), the ten page tools, and the registration. They are the very
 * files the `/compose/` route serves, referenced absolutely, so one copy is fetched
 * once and cached for the whole node and no page inlines a byte of them
 * (AGSC-06-17's `script-src 'self'`, AGSC-06-21's page budget).
 *
 * The `/compose/` CONTROLLER is deliberately absent: it paints the compose form, and
 * an item page has none.
 */
const PAGE_TOOL_SCRIPTS = Object.freeze([
  '/compose/agsc-core.js', '/compose/agsc-page-tools.js', '/compose/webmcp.js',
]);

/** The ten tool names of AGSC-09-13, from the one manifest that defines them. */
function toolNames() {
  return manifest().tools.map((t) => t.name);
}

/**
 * The page controller. It is emitted as a classic script (AGSC-06-17's
 * `script-src 'self'`), and it:
 *   1. fetches the discovery document and `/graph.jsonld` — same origin, no key;
 *   2. recovers the item records with the algebra's own `itemsFromGraph`, paints one
 *      checkbox per item and the filters over them (a plain text match on title and
 *      description, a cluster, a tag), and shows the workspace in the same step as it
 *      hides the loading paragraph, so nothing a reader sees moves;
 *   3. runs `compose()` on every change and renders the verdict — in words (the
 *      brief's summary sentence) and as JSON — the closure explanations, the
 *      conflicts and the warnings (each with its code and a sentence), or, with
 *      nothing selected, asks the reader to select an item;
 *   4. once the page tools have read the published pages, shows the brief of the
 *      selection inline (dependency order, gaps, checklist) and offers its four files,
 *      with the blueprint outputs for the saved architecture of `?from=<slug>`
 *      (AGSC-07-25, AGSC-07-29), one link per file and one archive;
 *   5. emits the seven Harness files with `emit()` and offers ONE DOWNLOAD PER
 *      FILE, one "Download all (.zip)" link over the same files and one archive of
 *      the skill files alone — never adding a brief or blueprint file to the Harness
 *      archive (AGSC-07-13a);
 *   6. leaves `globalThis.AGSC_TOOLS` to `agsc-page-tools.js`, so that the WebMCP
 *      registration of AGSC-09-16 dispatches to the implementation the stdio server
 *      shares.
 *
 * @param {object} [options]
 * @param {string} [options.specVersion]
 * @param {string} [options.licenseProse]
 * @returns {string}
 */
function controller(options) {
  const opts = options || {};
  const terms = 'LicenseRef-AgenticSystemCore-Content-Use-1.0';
  const license = opts.licenseProse === undefined ? terms : opts.licenseProse;
  return `'use strict';
// SPDX-License-Identifier: Apache-2.0 (the engine's code; the prose it carries keeps its own terms)
// AgenticSystemCore /compose/ controller (AGSC-07-01, AGSC-07-13, AGSC-09-16).
// GENERATED by src/distribution/compose-page.js — do not edit.
// No network beyond this origin, no key, no server, no cookie, no storage.
(function () {
  var CORE = globalThis.AGSC_CORE;
  var SPEC_VERSION = ${JSON.stringify(String(opts.specVersion === undefined ? '' : opts.specVersion))};
  var LICENSE_PROSE = ${JSON.stringify(license)};
  var state = {
    base: '', bodies: {}, brief: null, briefGen: 0, filled: {}, from: '', full: null, instant: '', items: [], rows: [],
    saved: null, selection: [], verdict: null, version: ''
  };
  globalThis.AGSC_COMPOSE = state;

  function el(id) { return typeof document === 'undefined' ? null : document.getElementById(id); }
  function text(node, value) { if (node) node.textContent = value; }

  // AGSC-09-16: one tool contract, two transports. All TEN tools are implemented
  // by \`agsc-page-tools.js\`, which this page loads before this controller and which
  // installs \`globalThis.AGSC_TOOLS\`. This controller therefore installs NOTHING on
  // that name, so the page and the stdio server answer from the same implementation.

  /** The prompt shown while no item is selected: an empty selection is not a verdict. */
  var EMPTY = 'Select one or more items to compose.';

  /** The selection a \`/compose/?from=<slug>\` link names (AGSC-07-24). */
  function selectionFromQuery() {
    if (typeof location === 'undefined' || !location.search) return null;
    var match = /[?&]from=([^&]*)/.exec(location.search);
    return match === null ? decodeURIComponent('') || null : decodeURIComponent(match[1]);
  }

  function sha256Hex(value) {
    // Web Crypto, on this origin, over bytes this page already holds. It is the
    // ONLY asynchronous step, and the emitter stays synchronous and pure.
    var bytes = new TextEncoder().encode(value);
    return crypto.subtle.digest('SHA-256', bytes).then(function (buffer) {
      var out = '';
      var view = new Uint8Array(buffer);
      for (var i = 0; i < view.length; i += 1) out += view[i].toString(16).padStart(2, '0');
      return out;
    });
  }

  /**
   * One sentence per Composition warning (AGSC-07-07's \`AGSC-E803\`, AGSC-07-23's
   * \`AGSC-E804\`). A warning never invalidates a composition; the reader is told
   * what it means, not only its code.
   */
  function warningText(warning) {
    var source = warning.source === undefined ? '' : String(warning.source);
    var target = warning.target === undefined ? '' : String(warning.target);
    if (warning.code === 'AGSC-E804') {
      return source + ' consumes the port ' + target + ', and no selected item produces it;'
        + ' the composition is still valid (AGSC-07-23)';
    }
    if (warning.code === 'AGSC-E803') {
      return source + ' names ' + target + ' under ' + warning.key + ', which does not close a'
        + ' selection (only requires does), so it was not added (AGSC-07-05, AGSC-07-07)';
    }
    return 'a warning on ' + warning.key + ': ' + source + ' to ' + target;
  }
  state.warningText = warningText;

  /** Fill one list and its heading from entries, hiding both when there are none. */
  function fillListWith(id, entries, write) {
    var list = el(id);
    if (!list) return;
    list.textContent = '';
    list.hidden = entries.length === 0;
    if (el(id + '-heading')) el(id + '-heading').hidden = list.hidden;
    for (var i = 0; i < entries.length; i += 1) {
      var li = document.createElement('li');
      write(li, entries[i]);
      list.appendChild(li);
    }
  }
  function fillList(id, entries, line) {
    fillListWith(id, entries, function (li, entry) { li.textContent = line(entry); });
  }

  /** A text of the brief, each span between backticks shown as code (AGSC-07-27 writes slugs so). */
  function appendWithCode(node, value) {
    var parts = String(value).split(String.fromCharCode(96));
    for (var i = 0; i < parts.length; i += 1) {
      if (parts[i] === '') continue;
      if (i % 2 === 0) { node.appendChild(document.createTextNode(parts[i])); continue; }
      var code = document.createElement('code');
      code.textContent = parts[i];
      node.appendChild(code);
    }
  }

  /**
   * The verdict in words: the summary sentence of the brief (AGSC-07-25) — how many items, how
   * many added by closure and hidden by supersession, how many warnings, and whether the
   * composition is valid, naming the codes when it is not.
   */
  function verdictWords(result) {
    return CORE.summaryOf(CORE.listedVerdict(result, CORE.listedIndex({ items: state.items })), result);
  }
  state.verdictWords = verdictWords;

  function render() {
    var result = CORE.compose(state.items, state.selection);
    state.verdict = result;
    var empty = state.selection.length === 0;
    var verdict = el('verdict');
    if (verdict) verdict.textContent = empty ? '' : CORE.canonicalJson(CORE.verdictOf(result));
    var why = el('explanations');
    if (why) {
      why.textContent = '';
      why.hidden = result.added.length === 0;
      if (el('explanations-heading')) el('explanations-heading').hidden = why.hidden;
      for (var i = 0; i < result.added.length; i += 1) {
        var entry = result.added[i];
        var li = document.createElement('li');
        li.textContent = entry.slug + ' was added: ' + entry.path.map(function (step) {
          return step[0] + ' ' + step[1] + ' ' + step[2];
        }).join(', then ');
        why.appendChild(li);
      }
    }
    fillList('conflicts', result.conflicts, function (conflict) {
      return conflict.code + ' on ' + conflict.key + ': ' + conflict.pair.join(' / ');
    });
    fillList('warnings', empty ? [] : (result.warnings || []), function (warning) {
      return warning.code + ': ' + warningText(warning);
    });
    if (empty) text(el('validity'), EMPTY);
    else text(el('validity'), result.valid ? 'valid' : 'invalid — no Harness is emitted (AGSC-07-17)');
    text(el('verdict-words'), empty ? '' : verdictWords(result));
    var button = el('download');
    if (button) button.disabled = empty || !result.valid;
    refreshBrief();
  }

  /** The prompt of the brief while no item is selected, and while the pages are read. */
  var BRIEF_EMPTY = 'The brief of the composition appears here once items are selected.';
  var BRIEF_WAIT = 'The brief is written once the published pages of this node are read.';

  /**
   * The saved architecture of \`?from=<slug>\` while the selection is still the one it saves:
   * the blueprint outputs of AGSC-07-29 are that architecture's, and \`agsc compose --from
   * <slug> --brief\` writes them; for any other selection there is none.
   */
  function architectureFrom() {
    if (state.from === '' || state.saved === null || state.full === null) return null;
    var item = null;
    for (var i = 0; i < state.full.length; i += 1) if (state.full[i].slug === state.from) item = state.full[i];
    if (item === null || item.type !== 'concept' || item.kind !== 'architecture') return null;
    var same = CORE.byCodePoint(CORE.dedupe(state.saved)).join(' ') === CORE.byCodePoint(CORE.dedupe(state.selection)).join(' ');
    return same ? state.from : null;
  }

  /** Show the dependency order, the gaps and the checklist of a brief, or clear them. */
  function paintBrief(record) {
    var titles = {};
    var items = record === null ? [] : record.items;
    for (var i = 0; i < items.length; i += 1) titles[items[i].slug] = items[i].title;
    var tick = String.fromCharCode(96);
    fillListWith('brief-order', record === null ? [] : record.order, function (li, slug) {
      appendWithCode(li, titles[slug] + ' (' + tick + slug + tick + ')');
    });
    fillListWith('brief-gaps', record === null ? [] : record.gaps, function (li, gap) { appendWithCode(li, gap.text); });
    fillListWith('brief-checklist', record === null ? [] : record.checklist, function (li, entry) { appendWithCode(li, entry.text); });
    if (record !== null) return;
    clearLinks(el('brief-files'));
    clearLinks(el('brief-archive'));
  }

  /**
   * AGSC-07-25 / AGSC-07-29: the brief of the selection, shown inline and offered as its four
   * files — with the blueprint outputs when the selection is a saved architecture's — one link
   * per file and one archive of them all, which is never the Harness archive. It is computed over
   * the published pages the page tools read (\`AGSC_PAGE_TOOLS.corpus\`), the items the page tool
   * \`brief\` reads, so its bytes are those \`agsc compose --brief\` writes (AGSC-07-13).
   */
  function refreshBrief() {
    state.briefGen += 1;
    var generation = state.briefGen;
    if (state.selection.length === 0 || state.full === null) {
      text(el('brief-status'), state.selection.length === 0 ? BRIEF_EMPTY : BRIEF_WAIT);
      state.brief = null;
      paintBrief(null);
      return Promise.resolve(null);
    }
    var result = CORE.compose(state.full, state.selection);
    return sha256Hex(CORE.selectionDigestInput(result)).then(function (digest) {
      if (generation !== state.briefGen) return null;
      var options = {
        base: state.base, bundleVersion: state.version === '' ? undefined : state.version,
        instant: state.instant, items: state.full, licenseProse: LICENSE_PROSE, selectionDigest: digest,
        specVersion: SPEC_VERSION
      };
      var from = architectureFrom();
      var files = CORE.briefFiles(result, options);
      if (from !== null) files = files.concat(CORE.blueprintFiles(result, Object.assign({ architecture: from }, options)));
      var record = CORE.briefOf(result, options);
      state.brief = { files: new Map(files), record: record };
      text(el('brief-status'), from === null
        ? 'The brief of this composition, as agsc compose --brief writes it:'
        : 'The brief and the blueprint of ' + from + ', as agsc compose --from ' + from + ' --brief writes them:');
      paintBrief(record);
      offerFiles('brief-files', state.brief.files);
      return offerArchive('brief-archive', state.brief.files, CORE.harnessName(digest) + '-brief', 'Download the brief (.zip)');
    }).then(function () { return state.brief; });
  }
  state.refreshBrief = refreshBrief;

  /**
   * AGSC-06-02 + AGSC-05-07: the body of a selected Procedure, for its SKILL.md.
   * \`/pages/<slug>.md\` is the lint-normalized SOURCE FILE, so the frontmatter block
   * is stripped before the bytes reach the Harness emitter — AGSC-07-13 makes the
   * page's Harness byte-identical to the CLI's, and the CLI emits the body.
   */
  function loadBodies(slugs) {
    var wanted = [];
    for (var i = 0; i < slugs.length; i += 1) {
      if (state.bodies[slugs[i]] === undefined) wanted.push(slugs[i]);
    }
    return Promise.all(wanted.map(function (slug) {
      return fetch('/pages/' + encodeURIComponent(slug) + '.md')
        .then(function (r) { return r.ok ? r.text() : ''; })
        .catch(function () { return ''; })
        .then(function (text) { state.bodies[slug] = bodyOf(text); });
    }));
  }

  /** The body half of a published source file (AGSC-02-01's closed guard). */
  function bodyOf(text) {
    var tools = globalThis.AGSC_PAGE_TOOLS;
    if (tools && typeof tools.pageSplitFrontmatter === 'function') {
      return tools.pageSplitFrontmatter(text).body;
    }
    return String(text === undefined || text === null ? '' : text);
  }
  state.bodyOf = bodyOf;

  function itemsWithBodies() {
    return state.items.map(function (item) {
      var copy = {};
      for (var key in item) if (Object.prototype.hasOwnProperty.call(item, key)) copy[key] = item[key];
      if (state.bodies[item.slug] !== undefined) copy.body = state.bodies[item.slug];
      return copy;
    });
  }

  /** Per-file download. One link per Harness file, no archive writer. */
  function emitHarness() {
    var result = state.verdict || CORE.compose(state.items, state.selection);
    if (!result.valid) return Promise.resolve(null);
    var procedures = result.selection.filter(function (slug) {
      for (var i = 0; i < state.items.length; i += 1) {
        if (state.items[i].slug === slug) return state.items[i].type === 'procedure';
      }
      return false;
    });
    return loadBodies(procedures).then(function () {
      return sha256Hex(CORE.selectionDigestInput(result));
    }).then(function (digest) {
      // AGSC-07-13: the name reaches the emitted bytes, so BOTH hosts derive it
      // from the selection digest with the algebra's own \`harnessName\` — the CLI
      // writes the same files into \`dist/harness/<name>/\` (AGSC-07-12).
      // AGSC-04-25: the content version is the one the discovery document states,
      // the one the CLI derives from the same history (AGSC-07-13).
      var out = CORE.emit(result, {
        base: state.base, bundleVersion: state.version === '' ? undefined : state.version,
        instant: state.instant, items: itemsWithBodies(),
        licenseProse: LICENSE_PROSE, name: CORE.harnessName(digest), selectionDigest: digest,
        specVersion: SPEC_VERSION
      });
      offerFiles('files', out.files);
      state.harness = out;
      return archiveLink(out, digest).then(function () {
        // The skills of the Harness on their own, for an agent that installs only skills: a
        // second archive beside the first, never inside it (AGSC-07-13a).
        var skills = new Map();
        out.files.forEach(function (body, path) { if (path.indexOf('skills/') === 0) skills.set(path, body); });
        if (skills.size === 0) {
          clearLinks(el('skills-archive'));
          return null;
        }
        return offerArchive('skills-archive', skills, CORE.harnessName(digest) + '-skills', 'Download the skills (.zip)');
      }).then(function () { return out; });
    });
  }

  /**
   * Empty an element that holds download links, letting go of their object URLs first: the
   * brief is offered again on every change of the selection.
   */
  function clearLinks(node) {
    if (!node) return;
    if (typeof URL.revokeObjectURL === 'function' && typeof node.querySelectorAll === 'function') {
      var links = node.querySelectorAll('a');
      for (var i = 0; i < links.length; i += 1) URL.revokeObjectURL(links[i].href);
    }
    node.textContent = '';
  }

  /** One download link per file, in the list \`id\`; the slash of a path becomes a hyphen. */
  function offerFiles(id, files) {
    var list = el(id);
    if (!list) return;
    clearLinks(list);
    files.forEach(function (body, path) {
      var li = document.createElement('li');
      var link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
      link.download = path.split('/').join('-');
      link.textContent = path;
      li.appendChild(link);
      list.appendChild(li);
    });
  }

  /**
   * "Download all (.zip)" beside the per-file links — the archive module the
   * CLI's \`compose --zip\` runs, over the same files and the same instant, so the
   * bytes cannot differ (AGSC-07-13); named with the content version, SHA-256 shown.
   */
  function archiveLink(out, digest) {
    return offerArchive('archive', out.files, CORE.harnessName(digest), 'Download all (.zip)').then(function (zip) {
      if (zip !== null) state.archive = zip;
      return zip;
    });
  }

  /**
   * One archive of \`files\` (AGSC-07-13a, STORE profile, the build instant) as a link in the
   * element \`id\`, named from \`stem\` and the content version, its SHA-256 shown beside it.
   */
  function offerArchive(id, files, stem, label) {
    var holder = el(id);
    if (!holder) return Promise.resolve(null);
    clearLinks(holder);
    var zip = CORE.archiveBytes(files, { instant: state.instant });
    if (zip.violations.length > 0) return Promise.resolve(null);
    var link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([zip.bytes], { type: 'application/zip' }));
    link.download = CORE.archiveName(stem, state.version);
    link.textContent = label;
    holder.appendChild(link);
    return crypto.subtle.digest('SHA-256', zip.bytes).then(function (buffer) {
      var hex = '';
      var view = new Uint8Array(buffer);
      for (var i = 0; i < view.length; i += 1) hex += view[i].toString(16).padStart(2, '0');
      var sum = document.createElement('span');
      sum.className = 'sha';
      sum.textContent = ' SHA-256 ' + hex;
      holder.appendChild(sum);
      return zip;
    });
  }

  /** The value of one filter control, or the empty string when the page has none. */
  function valueOf(id) {
    var node = el(id);
    return node ? String(node.value || '') : '';
  }

  /**
   * The filters: a plain, case-insensitive text match on each item's title, description
   * and slug, a cluster (the cluster's members in the graph) and a tag (the item's own
   * \`tags\`, read with the published pages). They hide the rows that do not match and
   * never change the selection, so a ticked item stays in the composition while it is
   * filtered out.
   */
  function applyFilter() {
    var query = valueOf('filter').trim().toLowerCase();
    var cluster = valueOf('filter-cluster');
    var tag = valueOf('filter-tag');
    var shown = 0;
    for (var i = 0; i < state.rows.length; i += 1) {
      var row = state.rows[i];
      var match = (query === '' || row.text.indexOf(query) !== -1)
        && (cluster === '' || row.clusters.indexOf(cluster) !== -1)
        && (tag === '' || row.tags.indexOf(tag) !== -1);
      row.li.hidden = !match;
      if (match) shown += 1;
    }
    var parts = (query === '' ? '' : ' "' + query + '"') + (cluster === '' ? '' : ' in the cluster ' + cluster)
      + (tag === '' ? '' : ' tagged ' + tag);
    text(el('filter-status'), parts === '' ? '' : shown + ' of ' + state.rows.length + ' items match' + parts + '.');
    return shown;
  }
  state.applyFilter = applyFilter;

  /**
   * Add one \`<option>\` per value to a filter's list, after its "every" option, once: the
   * page paints its list again when \`start\` runs again, and the values do not change.
   */
  function addOptions(id, values, label) {
    var select = el(id);
    if (!select || state.filled[id] === true) return;
    state.filled[id] = true;
    for (var i = 0; i < values.length; i += 1) {
      var option = document.createElement('option');
      option.value = values[i];
      option.textContent = label(values[i]);
      select.appendChild(option);
    }
  }

  function showFilter() {
    var form = el('filter-form');
    var box = el('filter');
    if (!form || !box) return;
    form.addEventListener('submit', function (event) { event.preventDefault(); });
    box.addEventListener('input', applyFilter);
    for (var i = 0; i < 2; i += 1) {
      var select = el(i === 0 ? 'filter-cluster' : 'filter-tag');
      if (select) select.addEventListener('change', applyFilter);
    }
    form.hidden = false;
  }

  /**
   * Once the page tools have read the published pages: the full item records the brief is
   * written from, and the tag of every row, offered in the tag filter in code-point order.
   */
  function whenPagesRead() {
    var tools = globalThis.AGSC_PAGE_TOOLS;
    if (!tools || !tools.ready || typeof tools.ready.then !== 'function') return Promise.resolve(null);
    return tools.ready.then(function () {
      var corpus = tools.corpus;
      if (!corpus || !Array.isArray(corpus.items)) return null;
      state.full = corpus.items.map(function (item) {
        var flat = tools.pageFlatItem(item);
        flat.body = item.body;
        return flat;
      });
      var tagsOf = {};
      var all = [];
      for (var i = 0; i < state.full.length; i += 1) {
        var tags = Array.isArray(state.full[i].tags) ? state.full[i].tags.map(String) : [];
        tagsOf[state.full[i].slug] = tags;
        all = all.concat(tags);
      }
      for (var r = 0; r < state.rows.length; r += 1) state.rows[r].tags = tagsOf[state.rows[r].slug] || [];
      addOptions('filter-tag', CORE.byCodePoint(CORE.dedupe(all)), function (tag) { return tag; });
      return refreshBrief();
    });
  }
  state.whenPagesRead = whenPagesRead;

  function paint() {
    var list = el('items');
    if (!list) return;
    list.textContent = '';
    state.rows = [];
    // A cluster's members are \`skos:member\` on the cluster node of the graph.
    var clustersOf = {};
    var clusters = state.items.filter(function (item) { return item.type === 'cluster'; });
    for (var c = 0; c < clusters.length; c += 1) {
      var members = clusters[c].members || [];
      for (var m = 0; m < members.length; m += 1) {
        clustersOf[members[m]] = (clustersOf[members[m]] || []).concat([clusters[c].slug]);
      }
    }
    addOptions('filter-cluster', clusters.map(function (item) { return item.slug; }), function (slug) {
      for (var k = 0; k < clusters.length; k += 1) if (clusters[k].slug === slug) return clusters[k].title || slug;
      return slug;
    });
    for (var i = 0; i < state.items.length; i += 1) {
      var item = state.items[i];
      if (item.type === 'cluster') continue;
      var li = document.createElement('li');
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.value = item.slug;
      box.id = 'pick-' + item.slug;
      box.addEventListener('change', function (event) {
        var slug = event.target.value;
        var at = state.selection.indexOf(slug);
        if (event.target.checked && at === -1) state.selection.push(slug);
        if (!event.target.checked && at !== -1) state.selection.splice(at, 1);
        render();
      });
      var label = document.createElement('label');
      label.htmlFor = box.id;
      label.textContent = (item.title || item.slug) + ' (' + item.type + ')';
      li.appendChild(box);
      li.appendChild(label);
      list.appendChild(li);
      state.rows.push({ clusters: clustersOf[item.slug] || [], li: li, slug: item.slug, tags: [], text: [item.title, item.description, item.slug]
        .filter(function (part) { return typeof part === 'string'; }).join(' ').toLowerCase() });
    }
    showFilter();
    applyFilter();
    // No layout shift: the loading paragraph goes and the painted workspace comes in one step.
    if (el('loading')) el('loading').hidden = true;
    if (el('workspace')) el('workspace').hidden = false;
  }

  /**
   * AGSC-06-08: the build instant, from the discovery document's
   * \`agsc-generated-at\` on the \`describedby\` link. AGSC-07-13 makes the Harness
   * reproducible from "the graph plus the selection plus SOURCE_DATE_EPOCH", and this
   * is where a published node states that epoch — \`graph.jsonld\` does not carry it.
   * A document the page cannot read yields the empty string, never a wall clock
   * (AGSC-04-11): a page that guessed an instant would emit bytes the CLI cannot.
   */
  function describedValue(linkset, key) {
    var sets = (linkset && linkset.linkset) || [];
    for (var i = 0; i < sets.length; i += 1) {
      var described = (sets[i] && sets[i].describedby) || [];
      for (var j = 0; j < described.length; j += 1) {
        var values = described[j] && described[j][key];
        if (values && values.length > 0) return String(values[0]);
      }
    }
    return '';
  }
  function instantOf(linkset) { return describedValue(linkset, 'agsc-generated-at'); }
  state.instantOf = instantOf;

  /**
   * AGSC-06-08: the node's own base is the discovery document's \`anchor\` — the
   * \`site.base\` the CLI reads — never the origin the page happens to be served
   * from (a preview, a local server), which would put a different \`bundle:\` line
   * into the Harness than \`agsc compose\` writes (AGSC-07-13).
   */
  function baseOf(linkset) {
    var sets = (linkset && linkset.linkset) || [];
    var anchor = sets.length > 0 && sets[0] && typeof sets[0].anchor === 'string' ? sets[0].anchor : '';
    if (anchor === '') return location.origin + '/';
    var end = anchor.length;
    while (end > 0 && anchor.charAt(end - 1) === '/') end -= 1;
    return anchor.slice(0, end) + '/';
  }
  state.baseOf = baseOf;

  function start() {
    state.base = location.origin + '/';
    // The page tools read the corpus on THIS page at once (AGSC-09-16: the compose
    // page and the item pages carry the same tools; an item page reads it on the
    // first call instead, page-tools.js says why).
    var tools = globalThis.AGSC_PAGE_TOOLS;
    if (tools && typeof tools.start === 'function') tools.start();
    return fetch('/.well-known/knowledge-linkset').then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () {
      return null;
    }).then(function (linkset) {
      state.base = baseOf(linkset);
      state.instant = instantOf(linkset);
      // The content version names the archive (AGSC-04-25); none → "unversioned".
      state.version = describedValue(linkset, 'agsc-bundle-version');
      return fetch('/graph.jsonld');
    }).then(function (r) { return r.json(); }).then(function (graph) {
      state.items = CORE.itemsFromGraph(graph);
      if (state.instant === '') state.instant = String(graph['dcterms:modified'] || '');
      paint();
      var from = selectionFromQuery();
      state.from = from === null ? '' : from;
      if (from !== null && from !== '') {
        // AGSC-07-24: the page shows the same composition the saved architecture
        // names. The selection block lives in the item's body, so the page reads
        // the item's Markdown view rather than guessing.
        return fetch('/pages/' + encodeURIComponent(from) + '.md')
          .then(function (r) { return r.ok ? r.text() : ''; })
          .then(function (body) {
            var fence = /\`\`\`yaml agsc-selection\\n([\\s\\S]*?)\`\`\`/.exec(body);
            if (fence === null) return;
            var picked = [];
            fence[1].split('\\n').forEach(function (line) {
              var m = /^\\s*-\\s+(\\S+)\\s*$/.exec(line);
              if (m !== null) picked.push(m[1]);
            });
            state.selection = picked;
            state.saved = picked.slice();
            for (var i = 0; i < picked.length; i += 1) {
              var box = el('pick-' + picked[i]);
              if (box) box.checked = true;
            }
          });
      }
      return undefined;
    }).then(function () {
      render();
      return whenPagesRead();
    }).catch(function (error) {
      text(el('validity'), 'the published graph could not be read: ' + error.message);
    });
  }

  state.emitHarness = emitHarness;
  state.render = render;
  state.start = start;
  if (typeof document !== 'undefined' && document.getElementById) {
    var button = el('download');
    if (button) button.addEventListener('click', function () { emitHarness(); });
    start();
  }
}());
`;
}

module.exports = { ASSETS, PAGE_TOOL_SCRIPTS, controller, toolNames };
