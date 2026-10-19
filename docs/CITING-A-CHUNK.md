# How to cite a chunk

**Summary.** A node publishes its content pre-split into **chunks** in `/chunks.jsonl`,
each with a stable id and a digest of its text. This page says which six facts a
citation of one chunk needs, where each comes from in version 1.0.0, how to check the
citation again later, and what 1.0.0 does not give. It ends with a worked example taken
from the live node `https://agenticsystemcore.com/`. The page is informative; where it
disagrees with a rule in [`spec/`](../spec/README.md), the rule wins.

**Who this is for:** anyone — a person, an agent or a tool — who quotes a node's text
and wants the quote to be checkable. **Read after:**
[plain/06-surfaces.md](plain/06-surfaces.md) (the chunk export in plain words).

## What a chunk is

A chunk is one piece of one item's body, cut at the level-2 and level-3 headings that
lie outside code fences and, when a piece is too long, at a size bound (AGSC-06-27).
`/chunks.jsonl` holds one JSON object per line, one line per chunk (AGSC-06-26), with a
closed set of members (AGSC-06-29). A chunk carries no embedding. Above 500 items the
file becomes a manifest that names the shards, in order, and the lines are in the
shards (AGSC-06-31); a reader concatenates the shards and reads them as one file.

## The six facts a citation needs

| Fact | Where it comes from in 1.0.0 | Rule |
|---|---|---|
| **Item IRI** | the `iri` member of the chunk's line | AGSC-06-29 |
| **Unit id** | the `id` member: 64 lowercase hex characters, the SHA-256 of the UTF-8 bytes of the item IRI, a NUL byte, the section anchor, a NUL byte and the ordinal in decimal. The citation form is the item IRI, then `#chunk-`, then the leading 16 hex characters of `id`: `<iri>#chunk-<16 hex>` | AGSC-06-28 |
| **Digest** | the `digest` member: SHA-256 over exactly the UTF-8 bytes of the chunk's `text` value (the decoded string, not the escaped JSON), written as 64 lowercase hex characters with no algorithm prefix | AGSC-06-29 |
| **Licence** | the `license` member: an SPDX or `LicenseRef-` identifier, as the node states it. `LicenseRef-AgenticSystemCore-Content-Use-1.0` names the Content Use Terms 1.0 published with the specification; any other `LicenseRef-` identifier is the publisher's own. The text a node applies is at the target of the `license` link of its discovery document `/.well-known/knowledge-linkset` (its `/legal/` page, where it has one). The `terms` member names the terms that govern the prose on that node: the Content Use Terms where the node uses them, or the node's other prose licence (AGSC-06-18). Cite what the node states; do not carry one node's terms over to another | AGSC-06-29, AGSC-06-08, AGSC-06-18 |
| **Content version** | the `agsc-bundle-version` attribute on the `describedby` link of the discovery document; in a sharded export, also the manifest's `bundle_version`. A chunk line does not carry it | AGSC-04-25, AGSC-06-31 |
| **Retrieval time** | the citer's own clock, in UTC (for example `2026-10-19T07:37:28Z`); the node does not supply it | — |

The id depends only on the item IRI, the section and the ordinal, never on the text. A
later version can therefore serve different text under the same id, and that is why
the digest and the content version belong in the citation.

Two smaller points. The chunk digest is bare hex, while the discovery document writes
the digests of its own links as `sha-256=:<base64>:`; do not compare one form with the
other. And every chunk carries `trust: "untrusted"`: text quoted from a chunk into a
model is marked as untrusted there too (AGSC-08-18).

1.0.0 defines no citation format of its own. One way to write the six facts down:

```json
{
  "chunk": "<iri>#chunk-<16 hex>",
  "item": "<iri>",
  "digest": "<64 hex, SHA-256 of the UTF-8 bytes of text>",
  "license": "<license value>, terms at <license link of the discovery document>",
  "content_version": "<agsc-bundle-version>",
  "retrieved": "<UTC time of the fetch>"
}
```

## Checking a citation later

1. **Refetch** `/chunks.jsonl` from the node (and the shards, if it is a manifest) and
   find the line whose `id` begins with the 16 hex characters of the citation.
2. **Recompute** SHA-256 over the UTF-8 bytes of that line's `text`.
3. **Compare** the result with the cited digest.

| What you find | What it means |
|---|---|
| the id is there and the digest is equal | the node still serves exactly the cited text |
| the id is there and the digest differs | the text you fetched is not the cited text. Read `agsc-bundle-version` and `agsc-generated-at` from the discovery document as context: a different label is consistent with a newer build (or a rollback), and the same label does not prove the text is unchanged, because the label is derived from the git history or the build instant, not from the chunk bytes (AGSC-04-25). The digest comparison is the only proof; the version tells you where to look |
| the id is not there | the item was removed, retired or held back (AGSC-06-30), or its section heading or slug changed, or the section was re-split by the size bound, since the id is derived from the IRI, the section anchor and the ordinal. Check the content version the same way |

The recomputed digest proves that the text you hold is the text that was cited. It
does not, on its own, prove that the node served it at that version; see the next
section.

## Worked example from the live node

Retrieved from `https://agenticsystemcore.com/chunks.jsonl` at `2026-10-19T07:37:28Z`,
when the discovery document gave the content version `v1.0.0+24.g8f60e61f02ce`. The
chunk is the section "What done means" of the item "Release version 1.0.0 of the
specification":

| Fact | Value |
|---|---|
| item IRI | `https://agenticsystemcore.com/concepts/release-version-1-0-0/` |
| `id` | `63c33d7dec459a427b45e1d67f076cfc5179ce89d460d0f218cdc4a6f0926c3c` |
| citation form | `https://agenticsystemcore.com/concepts/release-version-1-0-0/#chunk-63c33d7dec459a42` |
| `section`, `ordinal` | `what-done-means`, `0` |
| digest | `ec89db3895a7299fa6052082366e471e667f6a5599cb26809e5b5b96ad17fce4` |
| licence | `LicenseRef-AgenticSystemCore-Content-Use-1.0`, text at `https://agenticsystemcore.com/legal/` |
| content version | `v1.0.0+24.g8f60e61f02ce` |
| retrieved | `2026-10-19T07:37:28Z` |

Recompute the digest and the id with Node.js (22.13 or later):

```bash
curl -s https://agenticsystemcore.com/chunks.jsonl \
  | grep '"id":"63c33d7dec459a42' \
  | node -e '
let s = ""; process.stdin.on("data", (d) => { s += d; }).on("end", () => {
  const r = JSON.parse(s), { createHash } = require("node:crypto");
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  console.log("digest", sha(Buffer.from(r.text, "utf8")) === r.digest ? "matches" : "DIFFERS", r.digest);
  console.log("id    ", sha(Buffer.from(`${r.iri}\0${r.section}\0${r.ordinal}`, "utf8")) === r.id ? "matches" : "DIFFERS", r.id);
});'
```

```text
digest matches ec89db3895a7299fa6052082366e471e667f6a5599cb26809e5b5b96ad17fce4
id     matches 63c33d7dec459a427b45e1d67f076cfc5179ce89d460d0f218cdc4a6f0926c3c
```

Or the digest alone with `jq` and `sha256sum` (`-j` prints the text with no newline
added, so the bytes hashed are exactly the bytes of `text`):

```bash
curl -s https://agenticsystemcore.com/chunks.jsonl \
  | jq -j 'select(.id | startswith("63c33d7dec459a42")) | .text' | sha256sum
```

```text
ec89db3895a7299fa6052082366e471e667f6a5599cb26809e5b5b96ad17fce4  -
```

And the content version and the licence link from the discovery document:

```bash
curl -s https://agenticsystemcore.com/.well-known/knowledge-linkset \
  | jq -r '.linkset[0].describedby[0]["agsc-bundle-version"][0], .linkset[0].license[0].href'
```

These values hold for the version named above. Once the node publishes a later
version, the same commands may print other values, and the table under "Checking a
citation later" says how to read the difference.

## What 1.0.0 does not give

- **No set-level commitment over the chunks.** The discovery document's link to
  `/chunks.jsonl` carries no digest, and no rule of the specification defines one value
  that fixes the whole set of chunk ids and digests of a version. A citer can show that
  the text they hold matches the cited digest, but no rule lets them show from the
  discovery document that the chunk was part of a given version. (The reference engine
  also writes `/exports/chunks-index.toon`, whose link carries a digest and which lists
  16-hex prefixes of each chunk's id and digest; it is not normative and not a full
  commitment.)
- **No per-chunk algorithm name.** The `digest` member is bare hex and the algorithm,
  SHA-256, is fixed by AGSC-06-29 rather than written in the record. Write
  "SHA-256" in a citation yourself.

Both are planned as additions for 1.1, the next version. Any such addition is a MINOR
change: a later MINOR may add members to a chunk line (AGSC-06-29) and a reader ignores
a member it does not know (AGSC-00-21), so a citation made under 1.0.0 stays checkable.
The plan carries no promise of dates.
