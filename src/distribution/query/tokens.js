'use strict';
// CONTEXT Distribution (Emission) — the query page of `/query/`: the page's own reading of
// a query.
//
// AGSC-06-39 (a): the page answers SELECT, ASK, CONSTRUCT and DESCRIBE and refuses an update
// and a SERVICE clause. The engine in the page refuses both as well, but not in a way a
// visitor can rely on: it lets `SERVICE SILENT` through with an empty answer, and it refuses
// an update only as a parse error that names no update (measured on Oxigraph 0.5.13).
// So the page reads the query first, with this small tokenizer, and
// refuses before anything runs; the engine's own refusal stays the second line.
//
// The tokenizer only classifies tokens: comments, IRIs, strings, variables, prefixed and
// blank-node names, numbers, words, keywords and single characters. It does not parse
// SPARQL, so a word counts only where it stands as a bare word — `"DELETE"`, `<x:LOAD>`,
// `?insert` and `ex:service` refuse nothing. The same tokens colour the editor
// (`queryHighlight`). One pass over the text: each step consumes at least one character,
// and no step looks back.
//
// The one place where SPARQL needs to know where it stands is `<`: inside an expression,
// after a value, it means "less than" (`FILTER(1<2)`), everywhere else it opens an IRI. Read
// as an IRI there, `1<2)SERVICE#>` would hide the SERVICE that the engine reads. So the
// tokenizer keeps the brackets it is inside: a `(` opens an expression outside every group,
// in a SELECT clause, inside another expression, or after FILTER, BIND, HAVING, BY, ASC,
// DESC, IN, a function's name, or an IRI or prefixed name that FILTER calls; any other `(`
// inside a group opens a collection or a VALUES row, where a value may follow a value.
//
// PORTABLE: each function below is emitted into the page and into its worker as its own
// source text (`query-page.js`), so both run exactly what `tests/distribution/query/`
// tests. A portable function names no module-scope binding and requires nothing; the only
// free names are the language's own and the other functions of `PORTABLE`
// (`tests/arch/query-portable.test.js`). Pure: no I/O, no clock, no random number.

/**
 * The tokens of a text, in order; their texts joined give the text back.
 *
 * @param {string} text
 * @returns {Array<{kind:string, text:string}>} `kind` is one of space, comment, iri,
 *   string, variable, prefixed, blank, number, keyword, word, punct.
 */
function queryTokens(text) {
  const source = String(text);
  const keywords = ['ADD', 'ALL', 'AS', 'ASC', 'ASK', 'BASE', 'BIND', 'BY', 'CLEAR', 'CONSTRUCT', 'COPY', 'CREATE', 'DATA',
    'DEFAULT', 'DELETE', 'DESC', 'DESCRIBE', 'DISTINCT', 'DROP', 'EXISTS', 'FILTER', 'FROM', 'GRAPH', 'GROUP', 'HAVING', 'IN',
    'INSERT', 'INTO', 'LIMIT', 'LOAD', 'MINUS', 'MOVE', 'NAMED', 'NOT', 'OFFSET', 'OPTIONAL', 'ORDER', 'PREFIX', 'REDUCED',
    'SELECT', 'SERVICE', 'SILENT', 'TO', 'UNDEF', 'UNION', 'USING', 'VALUES', 'WHERE', 'WITH'];
  const nameChar = (ch) => /[\p{L}\p{N}_\-\u00B7]/u.test(ch);
  const localChar = (ch) => nameChar(ch) || ch === '.' || ch === ':' || ch === '%';
  const out = [];
  let at = 0;
  /** The brackets the text is inside, innermost last: `expr`, `group` (`{` and `[`) or `list`. */
  const frames = [];
  let selectClause = false;
  /** The last two tokens that are not space or comment, the last one last. */
  let seen = [];
  const lastIs = (kinds) => seen.length > 0 && kinds.includes(seen[seen.length - 1].kind);
  const wordOf = (token) => (token === undefined || token.kind !== 'keyword' ? '' : token.text.toUpperCase());
  /** Whether a `(` at this point opens an expression (see the header). */
  const opensExpression = () => {
    const top = frames[frames.length - 1];
    if (top === undefined || top === 'expr') return true;
    if (top === 'list') return false;
    const [before, last] = seen.length > 1 ? seen : [undefined, seen[0]];
    return selectClause || lastIs(['word']) || ['FILTER', 'BIND', 'HAVING', 'BY', 'ASC', 'DESC', 'IN'].includes(wordOf(last))
      || (lastIs(['iri', 'prefixed']) && wordOf(before) === 'FILTER');
  };
  /** Whether a `<` at this point compares: inside an expression, after a value. */
  const compares = () => frames[frames.length - 1] === 'expr'
    && (lastIs(['variable', 'number', 'string', 'iri', 'prefixed', 'blank', 'word']) || (lastIs(['punct']) && seen[seen.length - 1].text === ')'));
  /** What a token changes in the brackets and the SELECT clause. */
  const follow = (token) => {
    if (token.kind === 'space' || token.kind === 'comment') return;
    if (token.text === '(') frames.push(opensExpression() ? 'expr' : 'list');
    else if (token.text === '{' || token.text === '[') frames.push('group');
    else if (token.text === ')' || token.text === '}' || token.text === ']') frames.pop();
    if (wordOf(token) === 'SELECT') selectClause = true;
    else if (token.text === '{' || wordOf(token) === 'WHERE') selectClause = false;
    seen = [...seen.slice(-1), token];
  };
  /** The end of a run of characters that `ok` accepts, from `from`. */
  const runEnd = (from, ok) => {
    let end = from;
    while (end < source.length && ok(source[end])) end += 1;
    return end;
  };
  /** The end of a local name from `from`: none where it would start with a full stop, and a final full stop left out (it ends a triple). */
  const localEnd = (from) => {
    if (source[from] === '.') return from;
    let end = runEnd(from, localChar);
    while (end > from && source[end - 1] === '.') end -= 1;
    return end;
  };
  /** The end of a string that opens at `from`: a long one ends at its three quotes, a short one at its quote or its line (CR or LF). */
  const stringEnd = (from) => {
    const quote = source[from];
    const long = source.startsWith(quote.repeat(3), from);
    let end = from + (long ? 3 : 1);
    while (end < source.length) {
      if (source[end] === '\\') { end += 2; continue; }
      if (long ? source.startsWith(quote.repeat(3), end) : source[end] === quote) return end + (long ? 3 : 1);
      if (!long && (source[end] === '\n' || source[end] === '\r')) return end;
      end += 1;
    }
    return source.length;
  };
  /** The end of an IRI that opens at `from`, or -1 where `<` is a character of its own. */
  const iriEnd = (from) => {
    const end = runEnd(from + 1, (ch) => ch > ' ' && !'<>"{}|^`\\'.includes(ch));
    return source[end] === '>' ? end + 1 : -1;
  };
  /** The token that starts at `from`: its kind and its end. */
  const next = (from) => {
    const ch = source[from];
    if (/\s/u.test(ch)) return ['space', runEnd(from, (c) => /\s/u.test(c))];
    if (ch === '#') return ['comment', runEnd(from, (c) => c !== '\n' && c !== '\r')];
    if (ch === '"' || ch === '\'') return ['string', stringEnd(from)];
    if (ch === '<' && !compares() && iriEnd(from) > 0) return ['iri', iriEnd(from)];
    if ((ch === '?' || ch === '$') && nameChar(source[from + 1] || '')) return ['variable', runEnd(from + 1, nameChar)];
    if (ch === '_' && source[from + 1] === ':') return ['blank', localEnd(from + 2)];
    if (ch === ':') return ['prefixed', localEnd(from + 1)];
    if (/[0-9]/u.test(ch)) return ['number', runEnd(from, (c) => /[0-9.eE]/u.test(c))];
    if (nameChar(ch)) {
      const end = runEnd(from, nameChar);
      if (source[end] === ':') return ['prefixed', localEnd(end + 1)];
      const word = source.slice(from, end);
      return [keywords.includes(word.toUpperCase()) || word === 'a' ? 'keyword' : 'word', end];
    }
    return ['punct', from + 1];
  };
  while (at < source.length) {
    const [kind, end] = next(at);
    const token = { kind, text: source.slice(at, end) };
    out.push(token);
    follow(token);
    at = end;
  }
  return out;
}

/**
 * What the page needs to know of a query before it runs it: its form (the first of
 * SELECT, ASK, CONSTRUCT, DESCRIBE that stands as a keyword), the first word that makes the
 * page refuse it (an update keyword, or SERVICE), and whether it names its own dataset with
 * FROM, in which case it runs over that dataset and not over the union of the node's graphs.
 * A bare word that holds a refused word refuses too: the engine reads `a1SERVICE` as `a`,
 * `1` and `SERVICE`, and no function name, boolean or language tag of SPARQL holds one.
 *
 * @param {string} text
 * @returns {{form:(string|null), refusal:({reason:string, word:string}|null), dataset:boolean}}
 */
function queryCheck(text) {
  const list = queryTokens(text);
  const words = list.filter((t) => t.kind === 'keyword').map((t) => t.text.toUpperCase());
  const updates = ['INSERT', 'DELETE', 'LOAD', 'CLEAR', 'CREATE', 'DROP', 'COPY', 'MOVE', 'ADD'];
  const refusing = [...updates, 'SERVICE'];
  const held = (t) => (t.kind === 'keyword' ? refusing.filter((w) => w === t.text.toUpperCase())
    : t.kind === 'word' ? refusing.filter((w) => t.text.toUpperCase().includes(w)) : []);
  const refused = list.flatMap(held)[0];
  return {
    dataset: words.includes('FROM'),
    form: words.find((w) => ['SELECT', 'ASK', 'CONSTRUCT', 'DESCRIBE'].includes(w)) || null,
    refusal: refused === undefined ? null : { reason: refused === 'SERVICE' ? 'service' : 'update', word: refused },
  };
}

/**
 * Why the page does not run a query, in a sentence, or null when it runs it: an update,
 * a SERVICE clause, or a text with no query form. The page says it before the worker is
 * asked, and the worker says the same if it is asked anyway.
 *
 * @param {{form:(string|null), refusal:({reason:string, word:string}|null)}} check from `queryCheck`.
 * @returns {string|null}
 */
function queryRefusal(check) {
  if (check.refusal !== null && check.refusal.reason === 'update') {
    return `This page does not change the graph: ${check.refusal.word} is an update, and an update is refused.`;
  }
  if (check.refusal !== null) return 'This page sends no query to another server: a SERVICE clause is refused.';
  return check.form === null ? 'Write a SELECT, ASK, CONSTRUCT or DESCRIBE query.' : null;
}

/**
 * The coloured copy of the editor's text, as a tree for the page's element writer: one
 * `span` per token that is not white space, classed by its kind, and the white space as
 * text. It ends with one more line feed, so that the copy is as tall as the text area when
 * the text ends with a line feed.
 *
 * @param {string} text
 * @returns {Array} the children of the copy.
 */
function queryHighlight(text) {
  const parts = queryTokens(text).map((t) => (t.kind === 'space' ? t.text : ['span', { class: `q-${t.kind}` }, t.text]));
  return [...parts, '\n'];
}

/** The functions emitted into the page, in order. */
const PORTABLE = Object.freeze(['queryTokens', 'queryCheck', 'queryRefusal', 'queryHighlight']);

module.exports = { PORTABLE, queryCheck, queryHighlight, queryRefusal, queryTokens };
