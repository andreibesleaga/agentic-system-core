# Dublin Core profile of the graph

**Who this is for:** a metadata librarian or a developer who wants to see which frontmatter key becomes which RDF property, in the tabular form that Dublin Core tools read. **Read after:** [PROTOCOLS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/PROTOCOLS.md) (where the outside standards are used).

## Summary

`schema/dctap.csv` is a [DCTAP](https://www.dublincore.org/specifications/dctap/) (Dublin Core Tabular Application Profile) file. It states, one row for each key, the property a key is written as in the graph (`graph.nq`, `graph.ttl`), its datatype, and its closed list of values where the item schema has one. It has 25 rows in four shapes: `item`, `bundle`, `source` and `review`.

The file is **informative** and generated, never edited by hand (AGSC-05-26). The table of AGSC-05-26 in `spec/05-graph.md` decides what a key becomes; the profile only shows it in a form a tool can load. Every key that the table maps is a datatype property, so `valueNodeType` is `literal` on every row. A key that is absent writes no triple, so `mandatory` and `repeatable` are `false`. The one constraint is a picklist: where `schema/item.schema.json` closes a key with `enum`, the values are listed in `valueConstraint`.

## Read a row

```text
item,Item,asc:kind,kind,false,false,literal,xsd:string,,pattern taxonomy explainer principle decision spec task term architecture,picklist,concept only
```

The key `kind` of an item is written as the property `asc:kind`, a string, one of the ten values listed; the note says only a concept has it.

## Run the generator

```bash
node tools/gen-dc-profile            # writes schema/dctap.csv
node tools/gen-dc-profile --check    # exit 1 when the committed file is not what the sources give
node tools/gen-dc-profile --json     # the AGSC-09-11 envelope, verb "gen-dc-profile"
```

The tool imports nothing from `src/` (AGSC-09-90) and ships in the package. `--check` is part of the test suite, so a stale file fails the build.

## Changing the profile

Change the source, not the file: the item schema or the table in `spec/05-graph.md`. Then run `node tools/gen-dc-profile`. The sibling generator `tools/gen-shapes` reads the same sources; see [SHACL-SHAPES.md](SHACL-SHAPES.md).
