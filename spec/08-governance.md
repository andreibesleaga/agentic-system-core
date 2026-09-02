# AGSC-08 — Governance: provenance, gates, lints, ledger

## 8.1 Provenance contract

- **AGSC-08-01** Every item MUST carry `prov{origin, operator}`; `agent` and `model` MUST be present when `origin` is `ai-assisted` or `ai-generated`. A missing `prov` is `AGSC-E501`; a missing `operator` is `AGSC-E503`. [PRD-042 ← D07, Art. XIII]
- **AGSC-08-02** `prov.commit` and `prov.reviewer` MUST be derived at build — commit from a supplied git-log file, reviewer from `verified[]` — and MUST NOT be written into a content file. Continuous integration MUST NOT commit to the content branch. [PRD-042 ← G35, D27]
- **AGSC-08-03** A Review is evidenced by a `verified[]` entry `{by, at}` added by a human; the verdict lives in the forge. Agents MUST NOT add `verified[]` entries for their own changes. [audit/D §1.1, PRD-041]
- **AGSC-08-04** `propose` MUST write `dist/proposal/<n>.patch` and `dist/proposal/<n>.md`, print the commands a human must run, and MUST NOT perform any network write. [PRD-039 ← D13, D27]
- **AGSC-08-05** The pull-request body MUST contain the marker `<!-- agsc:proposal v1 -->` followed by rationale, affected slugs and `prov.origin`. [audit/D §3(b)]

## 8.2 DCO-Plus trailer grammar

- **AGSC-08-06** An accepted contribution MUST carry a trailer block matching:

```abnf
trailer-block = signoff *( LF assisted )
signoff       = "Signed-off-by:" SP name SP "<" email ">" SP "(" agreement ")"
assisted      = "Assisted-by:" SP producer "/" version SP "(operator:" SP actor ")"
agreement     = "CA-v1"
actor         = "human:" idstart *idchar
idstart       = lcalpha / DIGIT
idchar        = lcalpha / DIGIT / "." / "_" / "-"
lcalpha       = %x61-7A                       ; a-z
name          = nchar *( nchar / SP )         ; MUST NOT end with SP
nchar         = %x21-3B / %x3D / %x3F-7E      ; visible ASCII except "<" and ">"
email         = local "@" domain
local         = 1*( ALPHA / DIGIT / "." / "!" / "#" / "$" / "%" / "&" / "'" /
                    "*" / "+" / "-" / "/" / "=" / "?" / "^" / "_" / "`" /
                    "{" / "|" / "}" / "~" )   ; RFC 5322 dot-atom subset
domain        = label *( "." label )
label         = ( ALPHA / DIGIT ) [ *( ALPHA / DIGIT / "-" ) ( ALPHA / DIGIT ) ]
producer      = 1*( ALPHA / DIGIT / "-" / "_" / "." )
version       = 1*( ALPHA / DIGIT / "." / "-" / "+" )
```

`name` is disambiguated greedily: the **last** `SP "<"` on the line starts the email, everything before it is the name. `actor` is exactly the `human:<id>` form that AGSC-02-07 requires of `prov.operator`, so a valid trailer exists for every valid item. A missing or malformed trailer is `AGSC-E504`. [PRD-040 ← D07, D37, D48(5)]

- **AGSC-08-07** When `prov.origin` is `ai-assisted` or `ai-generated`, an `Assisted-by:` line naming the operator is REQUIRED in addition to the `Signed-off-by:` line, and the operator MUST match `prov.operator` (`AGSC-E505`). [PRD-040, PLAN §12 T2]
- **AGSC-08-08** Approval is human-only. An agent MUST NOT be recorded as an approver. [D13, PRD-041]

## 8.3 Gates

- **AGSC-08-09** A `gate` item's `checks[]` MUST compile to named required status checks, one per value; `level: L1` covers `schema` and `links`, `level: L2` adds `provenance`, `determinism` and `review`. [PRD-031 ← D44(b), research/12 §P rule 29]
- **AGSC-08-10** A gate verdict MUST be written to `dist/gate.json` as a JCS-canonical object `{gate, level, checks:[{name, status, findings}], status}` where `status` ∈ `pass|fail`. [PRD-031, AGSC-04-04]
- **AGSC-08-11** A broken internal link MUST fail the Bundle's own gate; it MUST NOT reject an imported foreign bundle. [research/12 §P rule 30, AGSC-01-22]
- **AGSC-08-12** `enforce[]` is limited to `status-check` at 1.x. Compilation to hooks or code-owner files is out of scope. [audit/D §1.2, G34]

## 8.4 The four agent-safety lints

- **AGSC-08-13** **`injection-scan`** MUST detect, over item bodies and every exported prose surface: agent-directed imperatives; hidden text (HTML comments, zero-width characters, U+E0000–U+E007F tags, bidirectional overrides); long base64 or hex blobs; links whose scheme is neither `http` nor `https`. Codes: `AGSC-E401` (imperatives, blobs, schemes), `AGSC-E402` (hidden text). [NFR-07 ← N9, ADR-001]
- **AGSC-08-14** Severity MUST be `warn` for human-authored items and `error` when `prov.agent` is set. Patterns come from `lint.injection_patterns[]` as literal alternations — never a user-supplied regular expression — over input capped at 1 MiB. [ADR-001, PLAN §8]
- **AGSC-08-15** **`no-secrets`** MUST reject credential-shaped strings — private-key blocks, provider token prefixes, `password:`/`api_key:` assignments (`AGSC-E403`). [PRD-046, D40(7)]
- **AGSC-08-16** **`no-pii`** MUST reject e-mail addresses and telephone numbers outside `prov` and `sources[]` (`AGSC-E404`). [NFR-07, PLAN §12 T8]
- **AGSC-08-17** **`clean-room`** MUST refuse a non-empty `bookRef` on import, exclude `endorsements.json`, `book.md` and `start-here.json`, reject book or "companion" framing and any reading-order construct, and forbid a whole-corpus PDF or EPUB emitter (`AGSC-E405`). [NFR-12 ← D08, W1–W12, Art. XIII]
- **AGSC-08-18** Tools MUST take item ids only; no signature may accept a path, URL or shell string. Every tool result MUST be JSON carrying `source`, `trust`, `license`, `type` and `body`, with `trust` fixed at `untrusted`. [NFR-07 ← N9, PRD-023]
- **AGSC-08-19** These lints prove neither safety nor the absence of novel injection; hashes and attestations prove only that an artefact is what was published. An implementation MUST NOT claim more. [ADR-001 honest limit]

## 8.5 The ledger

- **AGSC-08-20** `ledger.jsonl` is a **derived artefact**, not a stored one: `build` and `ci` MUST recompute the whole file deterministically from the git history of the content branch (one entry per commit, in commit order, `kind` and `actor` read from the commit and its trailers) plus the facts of the run, and MUST write it only into the build output (`build.out`, default `www/`) and the release assets. It is one JCS-canonical object per LF-terminated line, hash-chained by AGSC-08-22, never hand-written, never committed to `content/` and never committed by CI (AGSC-08-02). Two builds of the same history therefore produce the same file — there is no append race, no partial-write recovery and no writer to serialize. [PRD-005 ← D44(h) as amended by D48(1), Art. XII]
- **AGSC-08-21** An entry has exactly `actor`, `hash`, `kind`, `prev`, `ref`, `ts`, plus OPTIONAL `usage{model, tokens_in, tokens_out, cost_usd, estimate}`. `kind` ∈ `build|proposal|merge|review|refresh|release`; `ref` is the commit or tag the entry derives from; `ts` derives from `SOURCE_DATE_EPOCH` (or, for a per-commit entry, from that commit's committer time) and never from a wall clock (AGSC-04-11). [D44(h), D48(1)]
- **AGSC-08-22** `hash` MUST be the lowercase hex SHA-256 of `prev` concatenated with the JCS serialization of the entry **excluding** its own `hash`. The first entry's `prev` is the empty string. [D44(h)]
- **AGSC-08-23** `verify --ledger` MUST recompute the chain offline — from the local git history for a clone, or over the published file for a downloaded one — and fail with `AGSC-E701` at the first mismatching `hash` or `prev`. It MUST additionally compare the recomputed chain head to `integrity.ledger_head` in the local well-known file (§06); a mismatch is `AGSC-E701` even when every line links correctly, which is what detects a truncated tail. A published file whose lines differ from the recomputation of the same history is `AGSC-E702`. [PRD-005, D48(1)]
- **AGSC-08-24** The chain head MUST be published in the well-known file's `integrity.ledger_head` (§06) and attested at release. [PRD-024, D44(h)]
- **AGSC-08-25** Monthly `usage.cost_usd` MUST be rolled up on the NOW page as a visible spend line; launch lanes MUST contain no model call. [NFR-11 ← D14, Art. XV]
