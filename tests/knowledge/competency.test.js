'use strict';
// verifies AGSC-05-41
// The competency questions of a site (AGSC-05-41), as `src/knowledge/competency.js` checks and
// answers them: the questions file is a JSON array of `{expected, id, query, question}`; each
// query is read by the pinned SPARQL 1.1 parser (Traqula) and refused as AGSC-E420 when it
// leaves the subset the rule names; the rest is run by the pinned query engine (Oxigraph) over
// the data graph and its answer compared with `expected` in the cell form the rule fixes.
//
// Deterministic: fixed data, fast-check with a fixed seed; no clock, no network.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const competency = require('../../src/knowledge/competency.js');
const turtle = require('../../src/knowledge/turtle.js');

const RUNS = { numRuns: 40, seed: 20261103, verbose: 0 };
const FILE = 'domain/questions.json';
const P = 'PREFIX ex: <https://example.org/ns#> ';

/** The data graph of these tests: two engines, a controller, a chain of parts, three literals. */
const DATA = turtle.parse(`@prefix ex: <https://example.org/ns#> .
ex:a a ex:Engine ; ex:label "alpha" ; ex:part ex:b .
ex:b a ex:Engine ; ex:label "beta"@en ; ex:part ex:c .
ex:c a ex:Part ; ex:size 3 .
ex:ctl ex:controls ex:b .
`);

/** One question as an object of the file. */
const question = (id, query, expected) => ({ expected, id, query: `${P}${query}`, question: `The question ${id}?` });
const fileOf = (...questions) => JSON.stringify(questions);
const codes = (findings) => findings.map((f) => f.code);
const ask = (query, expected = true) => fileOf(question('q', query, expected));
const select = (query, rows) => fileOf(question('q', query, { rows }));

test('a file of well-formed questions inside the subset has no fault', () => {
  const text = fileOf(
    question('engines', 'SELECT DISTINCT ?x WHERE { ?x a ex:Engine } ORDER BY DESC(?x) LIMIT 5', { rows: [] }),
    question('chain', 'ASK { ex:a ex:part/ex:part ex:c . ex:c ^ex:part ex:b . ex:a ex:part+ ?y . ?y ex:part* ?z }', true),
    question('filters', 'SELECT ?x { ?x ex:label ?l FILTER((?l = "alpha" || ?l != "beta") && !(?x = ex:c)) }', { rows: [] }),
    question('unmatched', 'ASK { ?x a ex:Engine FILTER NOT EXISTS { ?x ex:controlledBy ?c . FILTER(?c != ex:a) } }', false),
    question('compare', 'ASK { ?x ex:size ?s FILTER(?s < 4 && ?s <= 3 && ?s > 2 && ?s >= 3) }', true),
    question('star', 'SELECT * { ?x ex:part ?y }', { rows: [] }),
  );
  assert.deepStrictEqual(competency.check(text, { file: FILE }), []);
});

test('the findings of the file name it, and each is the error AGSC-E420', () => {
  const findings = competency.check('not json', { file: FILE });
  assert.deepStrictEqual(codes(findings), ['AGSC-E420']);
  assert.strictEqual(findings[0].file, FILE);
  assert.strictEqual(findings[0].severity, 'error');
  assert.match(findings[0].message, /AGSC-05-41/u);
});

const MALFORMED = {
  'not JSON': ['{', /not JSON/u],
  'not an array': ['{"id": "q"}', /not a JSON array/u],
  'an entry that is not an object': ['[1]', /entry 1 is not an object/u],
  'a missing member': [JSON.stringify([{ id: 'q', query: `${P}ASK { ?x ?p ?o }`, question: 'Q?' }]), /members/u],
  'an extra member': [JSON.stringify([{ ...question('q', 'ASK { ?x ?p ?o }', true), note: 'x' }]), /members/u],
  'an id that is not a slug': [fileOf(question('Not A Slug', 'ASK { ?x ?p ?o }', true)), /not a slug/u],
  'an empty question': [JSON.stringify([{ ...question('q', 'ASK { ?x ?p ?o }', true), question: ' ' }]), /question/u],
  'a query that is not a string': [JSON.stringify([{ ...question('q', 'ASK { ?x ?p ?o }', true), query: 3 }]), /query/u],
  'a repeated id': [fileOf(question('q', 'ASK { ?x ?p ?o }', true), question('q', 'ASK { ?x ?p ?o }', true)), /twice/u],
  'a query that is not SPARQL': [ask('ASK { ?x ?p }'), /not SPARQL 1\.1/u],
  'an ASK with rows': [ask('ASK { ?x ?p ?o }', { rows: [] }), /a boolean/u],
  'a SELECT with a boolean': [select('SELECT ?x { ?x ?p ?o }', true).replace('{"rows":true}', 'true'), /rows/u],
  'rows that are not arrays': [select('SELECT ?x { ?x ?p ?o }', ['<https://example.org/ns#a>']), /rows/u],
  'a cell that is a number': [select('SELECT ?x { ?x ?p ?o }', [[1]]), /rows/u],
  'expected with another member': [fileOf(question('q', 'SELECT ?x { ?x ?p ?o }', { rows: [], total: 0 })), /rows/u],
};

for (const [name, [text, message]] of Object.entries(MALFORMED)) {
  test(`a questions file with ${name} is AGSC-E420`, () => {
    const findings = competency.check(text, { file: FILE });
    assert.deepStrictEqual([...new Set(codes(findings))], ['AGSC-E420'], JSON.stringify(findings));
    assert.ok(findings.some((f) => message.test(f.message)), JSON.stringify(findings.map((f) => f.message)));
  });
}

/** Every construct of SPARQL 1.1 Query the subset leaves out, with the name its finding gives. */
const OUTSIDE = {
  'OPTIONAL': ['ASK { ?x ?p ?o OPTIONAL { ?x ex:q ?r } }', /OPTIONAL/u],
  'UNION': ['ASK { { ?x ?p ?o } UNION { ?o ?p ?x } }', /UNION/u],
  'MINUS': ['ASK { ?x ?p ?o MINUS { ?x a ex:Part } }', /MINUS/u],
  'BIND': ['ASK { ?x ?p ?o BIND(1 AS ?n) }', /BIND/u],
  'inline VALUES': ['ASK { VALUES ?x { ex:a } ?x ?p ?o }', /VALUES/u],
  'a trailing VALUES': ['SELECT ?x { ?x ?p ?o } VALUES ?x { ex:a }', /VALUES/u],
  'GRAPH': ['ASK { GRAPH ?g { ?x ?p ?o } }', /GRAPH/u],
  'SERVICE': ['ASK { SERVICE <https://example.org/sparql> { ?x ?p ?o } }', /SERVICE/u],
  'a sub-query': ['ASK { { SELECT ?x { ?x ?p ?o } } }', /sub-query|group/u],
  'a nested group': ['ASK { { ?x ?p ?o } }', /group/u],
  'OFFSET': ['SELECT ?x { ?x ?p ?o } OFFSET 1', /OFFSET/u],
  'REDUCED': ['SELECT REDUCED ?x { ?x ?p ?o }', /REDUCED/u],
  'FROM': ['SELECT ?x FROM <https://example.org/g> { ?x ?p ?o }', /FROM/u],
  'GROUP BY': ['SELECT ?x { ?x ?p ?o } GROUP BY ?x', /GROUP BY/u],
  'HAVING': ['SELECT ?x { ?x ?p ?o } GROUP BY ?x HAVING(?x = ex:a)', /HAVING/u],
  'a projected expression': ['SELECT (?x AS ?y) { ?x ?p ?o }', /AS/u],
  'an aggregate': ['SELECT (COUNT(?x) AS ?n) { ?x ?p ?o }', /AS|aggregate/u],
  'CONSTRUCT': ['CONSTRUCT { ?x ?p ?o } WHERE { ?x ?p ?o }', /CONSTRUCT/u],
  'DESCRIBE': ['DESCRIBE ex:a', /DESCRIBE/u],
  'a function': ['ASK { ?x ?p ?o FILTER(isIRI(?o)) }', /ISIRI/u],
  'NOW (a clock)': ['ASK { ?x ex:size ?s FILTER(NOW() > ?s) }', /NOW/u],
  'RAND (a random number)': ['ASK { ?x ex:size ?s FILTER(RAND() < ?s) }', /RAND/u],
  'REGEX': ['ASK { ?x ex:label ?l FILTER(REGEX(?l, "a")) }', /REGEX/u],
  'IN': ['ASK { ?x ?p ?o FILTER(?o IN (ex:a)) }', /IN/u],
  'EXISTS': ['ASK { ?x ?p ?o FILTER EXISTS { ?o ?q ?r } }', /EXISTS/u],
  'arithmetic': ['ASK { ?x ex:size ?s FILTER(?s + 1 = 4) }', /\+/u],
  'a bare term as a filter': ['ASK { ?x ?p ?o FILTER(?o) }', /FILTER/u],
  'a comparison of two comparisons': ['ASK { ?x ?p ?o FILTER((?x = ?o) = (?o = ?x)) }', /compar/u],
  'the path operator |': ['ASK { ?x ex:part|ex:label ?o }', /\|/u],
  'the path operator ?': ['ASK { ?x ex:part? ?o }', /\?/u],
  'a negated property set': ['ASK { ?x !ex:part ?o }', /!/u],
  'an ORDER BY expression': ['SELECT ?x { ?x ?p ?o } ORDER BY STR(?x)', /ORDER BY/u],
  'a NOT EXISTS with OPTIONAL inside': ['ASK { ?x ?p ?o FILTER NOT EXISTS { ?x ?p ?o OPTIONAL { ?o ?q ?r } } }', /OPTIONAL/u],
  'LIMIT without ORDER BY (which rows is left to the engine)': ['SELECT ?x { ?x a ex:Engine } LIMIT 1', /LIMIT without an ORDER BY/u],
  'an ORDER BY that leaves a projected variable out (ties)': ['SELECT ?x ?l { ?x ex:label ?l } ORDER BY ?x', /leaves out \?l/u],
  'an ORDER BY with LIMIT that leaves a projected variable out': ['SELECT ?x ?l { ?x ex:label ?l } ORDER BY ?l LIMIT 1', /leaves out \?x/u],
  'SELECT * with an ORDER BY that leaves a variable of the pattern out': ['SELECT * { ?x ex:part [ ex:part ?z ] } ORDER BY ?x', /leaves out \?z/u],
};

test('an ORDER BY that names every projected variable fixes the answer, so LIMIT may follow it', () => {
  const text = fileOf(
    question('first', 'SELECT ?x { ?x a ex:Engine . ?x ex:label ?l } ORDER BY ?l ?x LIMIT 1', { rows: [['<https://example.org/ns#a>']] }),
    question('star', 'SELECT * { ?x ex:part ?y FILTER NOT EXISTS { ?y ex:other ?w } } ORDER BY DESC(?y) ?x LIMIT 1', { rows: [['<https://example.org/ns#b>', '<https://example.org/ns#c>']] }),
    question('ask', 'ASK { ?x a ex:Engine } LIMIT 1', true),
  );
  assert.deepStrictEqual(competency.check(text, { file: FILE }), []);
  assert.deepStrictEqual(competency.evaluate(text, DATA).results.map((r) => [r.id, r.result]), [['ask', 'agrees'], ['first', 'agrees'], ['star', 'agrees']]);
});

for (const [name, [query, message]] of Object.entries(OUTSIDE)) {
  test(`a query with ${name} is outside the subset: AGSC-E420`, () => {
    const isAsk = /^(ASK|CONSTRUCT|DESCRIBE)/u.test(query);
    const findings = competency.check(isAsk ? ask(query) : select(query, []), { file: FILE });
    assert.deepStrictEqual([...new Set(codes(findings))], ['AGSC-E420'], `${query}: ${JSON.stringify(findings)}`);
    assert.ok(findings.some((f) => /outside the SPARQL subset/u.test(f.message) && message.test(f.message)),
      JSON.stringify(findings.map((f) => f.message)));
  });
}

test('an update is outside the subset: AGSC-E420', () => {
  const text = JSON.stringify([{ ...question('q', 'ASK { ?x ?p ?o }', true), query: 'INSERT DATA { <https://e.org/a> <https://e.org/p> 1 }' }]);
  const findings = competency.check(text, { file: FILE });
  assert.deepStrictEqual([...new Set(codes(findings))], ['AGSC-E420']);
});

test('a file with a fault answers no question', () => {
  const text = fileOf(question('good', 'ASK { ?x a ex:Engine }', true), question('bad', 'ASK { ?x ?p ?o OPTIONAL { ?x ?q ?r } }', true));
  const got = competency.evaluate(text, DATA, { file: FILE });
  assert.deepStrictEqual(codes(got.findings), ['AGSC-E420']);
  assert.deepStrictEqual(got.results, []);
});

test('ASK: the boolean agrees or differs', () => {
  const got = competency.evaluate(fileOf(
    question('yes', 'ASK { ?x a ex:Engine }', true),
    question('no', 'ASK { ?x a ex:Wheel }', true),
  ), DATA, { file: FILE });
  assert.deepStrictEqual(got.findings, []);
  assert.deepStrictEqual(got.results.map(({ answer, id, result }) => ({ answer, id, result })), [
    { answer: false, id: 'no', result: 'differs' },
    { answer: true, id: 'yes', result: 'agrees' },
  ]);
});

test('SELECT: cells are terms in N-Triples form; a plain string has no datatype; an unbound variable is null', () => {
  const got = competency.evaluate(select('SELECT ?x ?l ?none { ?x ex:label ?l } ORDER BY ?x ?l ?none', [
    ['<https://example.org/ns#a>', '"alpha"', null],
    ['<https://example.org/ns#b>', '"beta"@en', null],
  ]), DATA, { file: FILE });
  assert.deepStrictEqual(got.results[0].answer, { rows: [
    ['<https://example.org/ns#a>', '"alpha"', null],
    ['<https://example.org/ns#b>', '"beta"@en', null],
  ] });
  assert.strictEqual(got.results[0].result, 'agrees');
  const typed = competency.evaluate(select('SELECT ?s { ex:c ex:size ?s }', [['"3"^^<http://www.w3.org/2001/XMLSchema#integer>']]), DATA);
  assert.strictEqual(typed.results[0].result, 'agrees', JSON.stringify(typed.results[0].answer));
});

test('SELECT with ORDER BY: the order of the rows is part of the answer', () => {
  const rows = [['<https://example.org/ns#b>'], ['<https://example.org/ns#a>']];
  const descending = competency.evaluate(select('SELECT ?x { ?x a ex:Engine } ORDER BY DESC(?x)', rows), DATA);
  assert.strictEqual(descending.results[0].result, 'agrees');
  const ascending = competency.evaluate(select('SELECT ?x { ?x a ex:Engine } ORDER BY ?x', rows), DATA);
  assert.strictEqual(ascending.results[0].result, 'differs');
});

test('SELECT without ORDER BY: rows are compared sorted cell by cell, so their order in the file does not matter', () => {
  const got = competency.evaluate(select('SELECT ?x ?y { ?x ex:part ?y }', [
    ['<https://example.org/ns#b>', '<https://example.org/ns#c>'],
    ['<https://example.org/ns#a>', '<https://example.org/ns#b>'],
  ]), DATA);
  assert.strictEqual(got.results[0].result, 'agrees');
  assert.deepStrictEqual(got.results[0].answer.rows, [
    ['<https://example.org/ns#a>', '<https://example.org/ns#b>'],
    ['<https://example.org/ns#b>', '<https://example.org/ns#c>'],
  ]);
});

test('SELECT *: the columns are the variables in code-point order', () => {
  const got = competency.evaluate(select('SELECT * { ?z ex:controls ?a }', [['<https://example.org/ns#b>', '<https://example.org/ns#ctl>']]), DATA);
  assert.strictEqual(got.results[0].result, 'agrees', JSON.stringify(got.results[0].answer));
});

test('the operators of the subset are evaluated: paths, NOT EXISTS, DISTINCT and LIMIT', () => {
  const got = competency.evaluate(fileOf(
    question('reach', 'SELECT ?y { ex:a ex:part+ ?y }', { rows: [['<https://example.org/ns#b>'], ['<https://example.org/ns#c>']] }),
    question('reflexive', 'SELECT ?y { ex:a ex:part* ?y }', { rows: [['<https://example.org/ns#a>'], ['<https://example.org/ns#b>'], ['<https://example.org/ns#c>']] }),
    question('inverse', 'SELECT ?y { ex:c ^ex:part/^ex:part ?y }', { rows: [['<https://example.org/ns#a>']] }),
    question('uncontrolled', 'SELECT ?x { ?x a ex:Engine FILTER NOT EXISTS { ?c ex:controls ?x } }', { rows: [['<https://example.org/ns#a>']] }),
    question('types', 'SELECT DISTINCT ?t { ?x a ?t }', { rows: [['<https://example.org/ns#Engine>'], ['<https://example.org/ns#Part>']] }),
    question('first', 'SELECT ?x { ?x a ex:Engine } ORDER BY ?x LIMIT 1', { rows: [['<https://example.org/ns#a>']] }),
  ), DATA);
  assert.deepStrictEqual(got.results.filter((r) => r.result !== 'agrees').map((r) => [r.id, r.answer]), []);
});

test('a query the engine refuses after the parser accepted it is AGSC-E420, and nothing is answered', () => {
  // A relative IRI with no base: the parser keeps it, the engine refuses it.
  const got = competency.evaluate(fileOf(question('good', 'ASK { ?x a ex:Engine }', true),
    question('relative', 'ASK { ?x ex:part <b> }', true)), DATA, { file: FILE });
  assert.deepStrictEqual(codes(got.findings), ['AGSC-E420']);
  assert.match(got.findings[0].message, /the engine could not run the query of relative: .*IRI/u);
  assert.deepStrictEqual(got.results, []);
});

test('the graph names of the data are ignored: a triple held in two graphs is one triple', () => {
  const named = turtle.parse([
    '<https://example.org/ns#a> <https://example.org/ns#part> <https://example.org/ns#b> <https://example.org/g1> .',
    '<https://example.org/ns#a> <https://example.org/ns#part> <https://example.org/ns#b> <https://example.org/g2> .',
    '',
  ].join('\n'), { format: 'N-Quads' });
  const got = competency.evaluate(select('SELECT ?y { ex:a ex:part ?y }', [['<https://example.org/ns#b>']]), named);
  assert.strictEqual(got.results[0].result, 'agrees', JSON.stringify(got.results[0].answer));
});

test('property: the order of the data quads changes no answer', () => {
  const text = fileOf(
    question('reach', 'SELECT ?y { ex:a ex:part+ ?y }', { rows: [] }),
    question('labels', 'SELECT ?x ?l { ?x ex:label ?l }', { rows: [] }),
    question('first', 'SELECT ?x ?t { ?x a ?t } ORDER BY ?t ?x LIMIT 1', { rows: [] }),
  );
  const reference = JSON.stringify(competency.evaluate(text, DATA).results);
  fc.assert(fc.property(fc.shuffledSubarray(DATA, { maxLength: DATA.length, minLength: DATA.length }), (shuffled) => {
    assert.strictEqual(JSON.stringify(competency.evaluate(text, shuffled).results), reference);
  }), RUNS);
});

test('property: a SELECT without ORDER BY agrees with its expected rows in any order', () => {
  const rows = [['<https://example.org/ns#a>', '"alpha"'], ['<https://example.org/ns#b>', '"beta"@en']];
  fc.assert(fc.property(fc.shuffledSubarray(rows, { maxLength: 2, minLength: 2 }), (order) => {
    const got = competency.evaluate(select('SELECT ?x ?l { ?x ex:label ?l }', order), DATA);
    assert.strictEqual(got.results[0].result, 'agrees');
  }), RUNS);
});

test('property: checking and answering are idempotent', () => {
  const text = fileOf(question('yes', 'ASK { ?x a ex:Engine }', true));
  assert.deepStrictEqual(competency.evaluate(text, DATA), competency.evaluate(text, DATA));
  assert.deepStrictEqual(competency.check(text), competency.check(text));
});

test('the subset is data, frozen, and names the forms and operators of the rule', () => {
  assert.ok(Object.isFrozen(competency.SUBSET));
  assert.deepStrictEqual([...competency.SUBSET.forms], ['ask', 'select']);
  assert.deepStrictEqual([...competency.SUBSET.paths].sort(), ['*', '+', '/', '^']);
  assert.deepStrictEqual([...competency.SUBSET.comparisons].sort(), ['!=', '<', '<=', '=', '>', '>=']);
});
