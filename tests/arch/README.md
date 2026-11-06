# `tests/arch/`

**Summary.** Architecture tests: context boundaries, purity of the core, what each context never touches, the built-ins of the application layer, pinned libraries, the one RDF reader, the one SHACL engine and the one SPARQL parser and engine (never at build), the one reading of the Link graph for the Mermaid export and the graph view (`link-graph.test.js`), the explorer of `/clusters/` shipped as self-contained source text with no dependency (`explorer-portable.test.js`), the context map beside the Harness and no crosswalk at build (`context-map.test.js`), the brief and a saved architecture's blueprint beside the Harness, never reached by the Harness writer, and portable to the page (`brief.test.js`), the page tools and the answers of the tools of 1.1 shipped as self-contained source text (`page-tools-portable.test.js`), the package file list, the plugin contract, text-source hygiene, the TypeScript parts (`typescript-parts.test.js`: the files compiled from `src-ts/` are what the compiler writes now, the options stay strict, TypeScript is needed by no install and no run, and no new agent-facing protocol module is plain JavaScript), and the suite leaving no scratch behind. Subject: the whole tree.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/arch/*.test.js"
```

`AGSC_AUDIT=1` adds `npm audit`, the one check that needs the network.

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
