# Letta, Mem0, Zep/Graphiti, LangMem — through COGX (ILLUSTRATIVE)

Cognee's COGX is "a common shape that all memory imports are translated into before
they enter Cognee" (docs.cognee.ai/examples/migrate-memory-systems, read
2026-09-23), with importers from Mem0, LangMem, Letta/MemGPT, Zep/Graphiti and
another Cognee instance. One archive from a node therefore reaches all of them:

```sh
agsc export --to cogx            # writes dist/export/cogx/ (manifest.json + *.jsonl)
```

The export step IS executed by the test suite (tests/interchange/cogx.test.js); the
Cognee side is not, because it needs a running Cognee. What the archive carries:
one entity per concept, one episode per episode, one memory per lesson, one memory
block per procedure, one raw node per cluster and gate, one document per chunk and
one fact per authored Link — every record with the item IRI, the licence, the
Content Use Terms and the trust mark in `metadata.agsc`.

Into a Letta agent, the memory blocks are the natural fit: a procedure's `when` line
becomes a block value with a 1,024-character limit. Into Mem0, the memories and the
documents are.

The other direction works too: `agsc import --from cogx <archive-dir>` reads a COGX
archive into a Bundle — entities become concepts, memories lessons, memory blocks
procedures, and facts typed Links; a foreign episode is reported and skipped,
because a COGX episode carries no outcome. An archive that carries
`permissions.json` (user e-mails and password hashes) is refused.
