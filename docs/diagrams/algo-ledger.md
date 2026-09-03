# Algorithm — hash-chained derived ledger (D44(h) as amended by D48(1), ADR-006)

## Derivation algorithm

```mermaid
flowchart TD
  A["agsc build / agsc ci runs"] --> B["Read the git history of the content branch\n(commits in order; kind and actor from the commit + its trailers)"]
  B --> C["One entry per first-parent commit, oldest first:\n{ts: committer time, kind: release|merge|commit,\nactor: Signed-off-by, ref: full sha, mode: auto when\nthe commit carries Channel-Auto} — then ONE trailing\nbuild entry {ts: SOURCE_DATE_EPOCH, ref: content tree hash,\nactor: process:agsc/<version>} (AGSC-08-20a)"]
  C --> D["canonical(entry_i) = JCS (sorted members, no whitespace)\nprev_0 = 64 zeros"]
  D --> E["hash_i = sha256(prev_i + canonical(entry_i))\nprev_0 = 64 zeros (genesis); prev_i+1 = hash_i"]
  E --> F["Write the WHOLE ledger.jsonl into build.out (www/)\nand the release assets — never into content/,\nnever committed by CI (AGSC-08-02, AGSC-08-20)"]
  F --> G["Publish the chain head (last hash)\nin /.well-known/agentic-knowledge integrity block"]
  G --> H{"Is this a tagged release?"}
  H -- yes --> I["Attest the head via actions/attest\n(SLSA v1.0 Build L2 wording)"]
  H -- no --> J["No attestation this run"]
```

## Offline re-verification (`agsc verify --ledger`)

```mermaid
sequenceDiagram
  participant CI as agsc build/ci
  participant Out as www/ledger.jsonl (derived)
  participant WK as /.well-known/agentic-knowledge
  participant Rel as tagged release
  participant Reader as offline verifier

  CI->>CI: recompute the chain from git history
  CI->>Out: write the whole file (deterministic, no append)
  CI->>WK: publish chain head in integrity block
  CI->>Rel: attest head (tag time only)

  Reader->>Out: fetch the published ledger.jsonl (or recompute it from a clone)
  Reader->>Reader: replay from genesis:\nhash_i = sha256(hash_i-1 + canonical(entry_i))
  Reader->>WK: read the local well-known integrity.ledger_head
  Reader->>Reader: compare recomputed head vs published head
  alt chain intact and heads match
    Reader-->>Reader: verify --ledger exits 0
  else any line tampered, reordered, or head mismatched (incl. a truncated tail)
    Reader-->>Reader: verify --ledger exits 1 — AGSC-E701 at the first break, AGSC-E702 if the file contradicts the history
  end
```

The ledger is a **derived artefact**, not a stored one (D48(1)): `build`/`ci` recompute the entire
file from git history plus the facts of the run and write it only into the build output and the
release assets. Nobody appends, so there is no bot commit (AGSC-08-02), no two-runner append race and
no partial-write recovery case — two builds of the same history produce the same bytes. Tampering with
any line breaks every subsequent hash, so `verify --ledger` fails deterministically at the first broken
link; the head comparison against `integrity.ledger_head` additionally catches a truncated tail, which
line-linkage alone cannot see. The published head is what an attestation signs at release time; it is
the only durable claim of "this history has not been altered since publication."

Trace: PRD-005, NFR-11 · D44(h), D48(1) · PLAN.md §6(a) steps 9–11, ADR-006, §12 T10.
