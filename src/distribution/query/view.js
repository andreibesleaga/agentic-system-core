'use strict';
// CONTEXT Distribution (Emission) — the query page of `/query/`: what is shown for a result.
//
// AGSC-06-39 (c): a result is shown as a table, and a CONSTRUCT, DESCRIBE or three-column
// result also as a graph picture; (e): a query is shared as a link whose fragment holds its
// text. Each part is written here as plain data — a tree of `[tag, attributes, ...children]`
// whose texts the page's element writer (`explorer/view.js#explorerBuild`) turns into text
// nodes — so no IRI, literal or query text of a result can become markup or a script.
//
//   * `queryTermText`: a term of the W3C JSON results format as text: a prefixed name where
//     one of the page's prefixes covers the IRI whole, else `<IRI>`; `_:label`; a literal in
//     quotes with its language tag or datatype (none for `xsd:string`);
//   * `queryTable`: the table of a SELECT, CONSTRUCT or DESCRIBE result, bounded to `limit`
//     rows (the downloads carry every row), or the sentence of an ASK answer;
//   * `queryGraph`: the nodes and links of the picture, for a result of exactly three
//     columns: each row whose middle value is an IRI is a link from its first value to its
//     third, classed by the relation key whose property the IRI is (`other` for any other
//     property). At most `max` nodes are drawn; `total` says how many there are. The
//     picture itself is drawn by the explorer's own layout and scene writer (`explorer/`),
//     not by a second layout engine;
//   * `querySummary`: the status line after a run;
//   * `queryShareHref` and `queryFromHash`: the share link `#query=<the query, encoded>`.
//     A fragment is never part of a request, so no server sees the query (AGSC-06-05).
//
// PORTABLE (see `tokens.js`): emitted into the page as its own source text.

/**
 * A term of a result as text.
 *
 * @param {{type:string, value:string, datatype?:string, 'xml:lang'?:string}|undefined} term
 * @param {Object<string,string>} prefixes prefix → namespace IRI.
 * @returns {string} empty for an unbound value.
 */
function queryTermText(term, prefixes) {
  if (term === undefined) return '';
  const name = (value) => {
    const prefix = Object.keys(prefixes).find((p) => value.startsWith(prefixes[p]) && /^[\p{L}\p{N}_-]+$/u.test(value.slice(prefixes[p].length)));
    return prefix === undefined ? `<${value}>` : `${prefix}:${value.slice(prefixes[prefix].length)}`;
  };
  if (term.type === 'uri') return name(term.value);
  if (term.type === 'bnode') return `_:${term.value}`;
  if (term['xml:lang'] !== undefined) return `"${term.value}"@${term['xml:lang']}`;
  const plain = term.datatype === undefined || term.datatype === 'http://www.w3.org/2001/XMLSchema#string';
  return plain ? `"${term.value}"` : `"${term.value}"^^${name(term.datatype)}`;
}

/**
 * The table of a result, or the sentence of a yes-or-no answer.
 *
 * @param {object} result a result in the W3C JSON results format.
 * @param {number} limit the most rows shown.
 * @param {Object<string,string>} prefixes
 * @returns {Array} a `table` tree, or a `p` tree for an ASK answer.
 */
function queryTable(result, limit, prefixes) {
  if (typeof result.boolean === 'boolean') {
    return ['p', { class: 'query-boolean' }, `The answer is ${result.boolean ? 'yes (true)' : 'no (false)'}.`];
  }
  const vars = result.head.vars;
  const rows = result.results.bindings;
  const count = `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`;
  const caption = rows.length > limit ? `The result: ${count}, the first ${limit} shown here; the downloads hold them all.` : `The result: ${count}.`;
  return ['table', { class: 'query-table' },
    ['caption', {}, caption],
    ['thead', {}, ['tr', {}, ...vars.map((v) => ['th', { scope: 'col' }, `?${v}`])]],
    ['tbody', {}, ...rows.slice(0, limit).map((row) => ['tr', {}, ...vars.map((v) => ['td', {}, queryTermText(row[v], prefixes)])])]];
}

/**
 * The nodes and links of the picture of a three-column result, in the shape the
 * explorer's layout and scene writer read.
 *
 * @param {object} result a result in the W3C JSON results format.
 * @param {Object<string,string>} prefixes
 * @param {Object<string,string>} keys the IRI of each relation key's property → the key.
 * @param {number} max the most nodes drawn.
 * @returns {{nodes:Array<object>, links:Array<object>, total:number}|null} null where the
 *   result has no picture.
 */
function queryGraph(result, prefixes, keys, max) {
  const vars = result.head.vars;
  if (!Array.isArray(vars) || vars.length !== 3) return null;
  const idOf = (term) => (term.type === 'literal'
    ? `literal ${term.value} ${term['xml:lang'] || ''} ${term.datatype || ''}` : `${term.type} ${term.value}`);
  const kinds = { bnode: 'Blank', literal: 'Literal', uri: 'IRI' };
  const rows = result.results.bindings.filter((row) => row[vars[0]] && row[vars[2]] && row[vars[1]] && row[vars[1]].type === 'uri');
  if (rows.length === 0) return null;
  const all = new Map();
  for (const row of rows) {
    for (const term of [row[vars[0]], row[vars[2]]]) {
      if (!all.has(idOf(term))) all.set(idOf(term), { id: idOf(term), label: queryTermText(term, prefixes), route: null, summary: '', type: kinds[term.type] });
    }
  }
  const nodes = [...all.values()].slice(0, max);
  const drawn = new Set(nodes.map((n) => n.id));
  const links = rows.map((row) => ({ key: keys[row[vars[1]].value] || 'other', source: idOf(row[vars[0]]), target: idOf(row[vars[2]]) }))
    .filter((link) => drawn.has(link.source) && drawn.has(link.target));
  return { links, nodes, total: all.size };
}

/**
 * The status line after a run.
 *
 * @param {{form:(string|null), json?:string, error?:string}} answer from the worker.
 * @returns {string}
 */
function querySummary(answer) {
  if (answer.error !== undefined) return answer.error;
  const result = JSON.parse(answer.json);
  if (typeof result.boolean === 'boolean') return `${answer.form} answered ${result.boolean ? 'yes' : 'no'}.`;
  const count = result.results.bindings.length;
  const unit = answer.form === 'SELECT' ? (count === 1 ? 'row' : 'rows') : (count === 1 ? 'triple' : 'triples');
  return `${answer.form} answered with ${count} ${unit}.`;
}

/**
 * The share link of a query: its text, encoded, in the fragment.
 *
 * @param {string} text
 * @returns {string} `#query=…`
 */
function queryShareHref(text) {
  return `#query=${encodeURIComponent(String(text))}`;
}

/**
 * The query a share link's fragment holds.
 *
 * @param {string} hash `location.hash`.
 * @returns {string|null} null where the fragment holds no query.
 */
function queryFromHash(hash) {
  const value = String(hash);
  if (!value.startsWith('#query=')) return null;
  try {
    return decodeURIComponent(value.slice('#query='.length));
  } catch (e) {
    return null;
  }
}

/** The functions emitted into the page, in order. */
const PORTABLE = Object.freeze(['queryTermText', 'queryTable', 'queryGraph', 'querySummary', 'queryShareHref', 'queryFromHash']);

module.exports = { PORTABLE, queryFromHash, queryGraph, queryShareHref, querySummary, queryTable, queryTermText };
