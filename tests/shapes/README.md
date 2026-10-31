# `tests/shapes/` — the negative graphs of the SHACL shapes

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
