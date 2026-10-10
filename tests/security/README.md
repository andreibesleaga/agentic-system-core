# `tests/security/`

**Summary.** Tests that feed the engine hostile text rather than one module's ordinary
cases. `fuzz-patterns.test.js` is the seeded fuzz lane of the text scanners that
replaced regular expressions: on a fixed set of generated short texts each scanner
returns exactly what the expression it replaced returned, and on long runs of every
character of that expression's alphabet it stays within a constant number of steps
per character.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/TESTING.md).

```bash
node --test "tests/security/*.test.js"
```

No clock is read and nothing is random: the seed and the number of texts are fixed,
and the bound counts steps (`tests/_linear-kit.js`), so the result cannot change with
the speed of the machine. Each scanner also has a unit test beside its module, named
`*-linear.test.js`.
