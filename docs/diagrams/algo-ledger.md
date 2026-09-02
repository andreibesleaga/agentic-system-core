# Algorithm — hash-chained ledger append (D44(h), ADR-006)

## Append algorithm

```mermaid
flowchart TD
  A["agsc build / agsc ci completes successfully"] --> B["Read prev = last ledger.jsonl line's hash\n(genesis value if ledger.jsonl is empty)"]
  B --> C["Construct entry = {ts, kind, ref, actor, prev}\nts derived from SOURCE_DATE_EPOCH"]
  C --> D["canonical(entry) = JCS canonicalization\n(sorted keys, LF, NFC)"]
  D --> E["hash = sha256(prev + canonical(entry))"]
  E --> F["Append exactly ONE line\n{ts, kind, ref, actor, prev, hash} to ledger.jsonl"]
  F --> G["Publish chain head (latest hash)\nin /.well-known/agentic-knowledge integrity block"]
  G --> H{"Is this a tagged release?"}
  H -- yes --> I["Attest the head via actions/attest\n(SLSA v1.0 Build L2 wording)"]
  H -- no --> J["No attestation this run"]
```

## Offline re-verification (`agsc verify --ledger`)

```mermaid
sequenceDiagram
  participant CI as agsc build/ci
  participant Ledger as ledger.jsonl
  participant WK as /.well-known/agentic-knowledge
  participant Rel as tagged release
  participant Reader as offline verifier

  CI->>Ledger: read prev = last line.hash
  CI->>CI: hash = sha256(prev + canonical(entry))
  CI->>Ledger: append {ts, kind, ref, actor, prev, hash}
  CI->>WK: publish chain head in integrity block
  CI->>Rel: attest head (tag time only)

  Reader->>Ledger: git clone / fetch ledger.jsonl
  Reader->>Reader: replay from genesis:\nrecompute hash_i = sha256(hash_i-1 + canonical(entry_i))
  Reader->>WK: fetch published head
  Reader->>Reader: compare recomputed head vs published head
  alt chain intact, heads match
    Reader-->>Reader: verify --ledger exits 0
  else any line tampered or heads differ
    Reader-->>Reader: verify --ledger exits 1, reports break at line n
  end
```

One line per event (`kind ∈ build|proposal|merge|review|refresh|release`), written only by
`agsc build`/`ci`, never by hand. Never rewritten: tampering with any earlier line breaks every
subsequent hash, so `verify --ledger` fails deterministically at the first broken link — no network
needed, the whole check runs against the local clone. The published head in the integrity block is
what an attestation signs at release time; it is the only durable claim of "this history has not been
altered since publication."

Trace: PRD-005, NFR-11 · D44(h) · PLAN.md §6(a) steps 9–11, ADR-006, §12 T10.
