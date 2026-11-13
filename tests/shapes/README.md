# `tests/shapes/` — the negative graphs of the SHACL shapes, and the SHACL Core fixtures

**Summary.** One small Turtle graph for each shape of `schema/item-shapes.ttl` that can report a result. The graph
breaks exactly the rule its shape states, so that a person can see what the shape catches, and the development lane
(`tests/tools/gen-shapes-lane.test.js`, see [docs/SHACL-SHAPES.md](../../docs/SHACL-SHAPES.md)) can check that the
shape does catch it.

**Read after:** [docs/SHACL-SHAPES.md](../../docs/SHACL-SHAPES.md).

## The rule for this folder

- `negative/<shape>.ttl` is named for the shape, with `ascs:` left off: `Link-implements-target.ttl` breaks
  `ascs:Link-implements-target`. The first line is a comment `# <shape>: <what is wrong>`.
- A graph holds only the triples that break the rule. It need not satisfy the other shapes; the lane asks only that
  the named shape reports, with the severity the shape declares.
- A shape that can report is any shape with a constraint of its own (`sh:datatype`, `sh:in`, `sh:minCount`,
  `sh:maxCount`, `sh:class`, `sh:nodeKind`, `sh:uniqueLang`, `sh:node`, `sh:or`, `sh:not` or `sh:sparql`). A node
  shape that only lists property shapes needs no graph. `tests/tools/gen-shapes.test.js` fails when a shape has no
  graph here or a graph here names no shape.
- When `tools/gen-shapes` gains a shape, add its graph in the same change.

## `core/` — the SHACL Core subset of a node's own invariants

The fixtures of AGSC-05-41, shared by the engine (`tests/knowledge/shacl-core.test.js`), the pySHACL lane
(`tests/knowledge/shacl-core-lane.test.js`) and the Python checker.

- `core/<component>/` exists for each of the twelve constraint components of the subset, named by the local name
  of its parameter (`minCount`, `in`, …). It holds `shapes.ttl`, `conforms.ttl` (no result), `violates.ttl` and
  `results.json`, the results `violates.ttl` gives, in the order and the form `src/knowledge/shacl-core.js` returns
  them. Each Turtle file starts with a comment that says what it shows. The folders between them use every target,
  both kinds of path, the three severities, named and blank property shapes, and a message.
- `core/refused/<name>.ttl` is a shapes file outside the subset, which is the error `AGSC-E420` and is not
  evaluated. Its first line is `# <what>: <why>`, and a message of the refusal names `<what>`.
- A new component, or a new way to leave the subset, gets its fixture here in the same change; the expected results
  are those pySHACL gives (run the lane).

