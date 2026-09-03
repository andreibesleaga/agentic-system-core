# AGSC-08 — Governance: provenance, gates, lints, ledger

## 8.1 Provenance contract

- **AGSC-08-01** Every item MUST carry `prov{origin, operator}`; `agent` and `model` MUST be present when `origin` is `ai-assisted` or `ai-generated`. A missing `prov` is `AGSC-E501`; a missing `operator` is `AGSC-E503`. [PRD-042 ← D07, Art. XIII]
- **AGSC-08-02** `prov.commit` and `prov.reviewer` MUST be derived at build — commit from a supplied git-log file, reviewer from `verified[]` — and MUST NOT be written into a content file. Continuous integration MUST NOT commit to the content branch — with the single exception of the `channel:auto` merge of AGSC-08-26, which is performed with the channel owner's own credential (`CHANNEL_TOKEN_<name>`), never with the CI token, and which is a merge of a Proposal the owner's registered `publish: auto` choice already ratified. [PRD-042 ← G35, D27, D52(4)]
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
- **AGSC-08-08** Approval is human-only. An agent MUST NOT be recorded as an approver. The channel owner's registered `publish: auto` choice (AGSC-01-31) is that human's **standing approval** for exactly the pull requests that satisfy every condition of AGSC-08-26 — a narrower, configured, revocable act, not an agent approving; nothing else may merge without a fresh `verified[]` entry. [D13, PRD-041, D52(4)]

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
- **AGSC-08-18** Tools MUST take item ids only — or, for `ask` and `remember` alone (AGSC-09-14a/14b), plain text that is treated strictly as data: never executed, never interpolated into a path, URL or shell string, and never resolved as an identifier. No signature may accept a path, URL or shell string. Every tool result MUST be JSON carrying `source`, `trust`, `license`, `type` and `body`, with `trust` fixed at `untrusted`. [NFR-07 ← N9, PRD-023]
- **AGSC-08-19** These lints prove neither safety nor the absence of novel injection; hashes and attestations prove only that an artefact is what was published. An implementation MUST NOT claim more. [ADR-001 honest limit]

## 8.5 The ledger

- **AGSC-08-20** `ledger.jsonl` is a **derived artefact**, not a stored one: `build` and `ci` MUST recompute the whole file deterministically from the git history of the content branch (one entry per commit, in commit order, `kind` and `actor` read from the commit and its trailers) plus the facts of the run, and MUST write it only into the build output (`build.out`, default `www/`) and the release assets. It is one JCS-canonical object per LF-terminated line, hash-chained by AGSC-08-22, never hand-written, never committed to `content/` and never committed by CI (AGSC-08-02). Two builds of the same history therefore produce the same file — there is no append race, no partial-write recovery and no writer to serialize. [PRD-005 ← D44(h) as amended by D48(1), Art. XII]
- **AGSC-08-20a** **Derivation (normative, byte-reproducible).** The input is the git-log file of AGSC-08-02, a JCS-canonical JSON array `[{sha, committed_at, parents[], tag?, trailers{}}]` listing the **first-parent** commit chain of the content branch from the root commit to HEAD, oldest first; a shallow clone MUST fetch the full history or exit 2 with `AGSC-E703`. The ledger is then exactly one entry per element, in that order, followed by exactly one trailing entry, and nothing else:
  - **per commit** — `ts` = `committed_at`, rendered per AGSC-04-10 as `YYYY-MM-DDTHH:MM:SSZ`, `ref` = the full 40-hex `sha`, `actor` = the `Signed-off-by` local part normalized to `human:<id>` per AGSC-02-90(2) (else `human:unknown`), `kind` = `release` when a `v*` tag points at the commit, else `merge` when it has ≥2 parents or a `Proposal:` trailer, else `commit`; `mode: "auto"` is added when and only when the commit carries the `Channel-Auto: <name>` trailer written by the auto lane (AGSC-08-26).
  - **one trailing `build` entry** — `ts` = `SOURCE_DATE_EPOCH`, `kind` = `build`, `ref` = the git tree hash of `content/`, `actor` = `process:agsc/<version>`. It is the only entry that depends on the run, and it depends on nothing about *who* ran it, so owner and CI builds of one history agree byte for byte.
  An empty history yields the trailing `build` entry alone. No other `kind` is emitted at 1.0: `proposal`, `review` and `refresh` are reserved for 1.x. [PRD-005 ← D52(2), V3-02]
- **AGSC-08-21** An entry has exactly `actor`, `hash`, `kind`, `prev`, `ref`, `ts`, plus OPTIONAL `usage{model, tokens_in, tokens_out, cost_usd, estimate}` and OPTIONAL `mode` ∈ `auto|hitl` on a `kind: merge` entry (AGSC-08-20a; derived from the merge commit's trailer, never from forge metadata). `kind` ∈ `build|commit|merge|release` at 1.0, with `proposal|review|refresh` reserved. `ref` and `ts` are fixed by AGSC-08-20a and never read a wall clock (AGSC-04-11). [D44(h), D48(1), D52(2), V3-37]
- **AGSC-08-22** `hash` MUST be the lowercase hex SHA-256 of `prev` concatenated with the JCS serialization of the entry **excluding** its own `hash`. The first entry's `prev` is 64 `0` characters (the all-zero SHA-256 in lowercase hex), which makes the genesis link the same fixed width as every other and removes the empty-string special case. [D44(h), D52(2)]
- **AGSC-08-23** `verify --ledger` MUST recompute the chain offline — from the local git history for a clone, or over the published file for a downloaded one — and fail with `AGSC-E701` at the first mismatching `hash` or `prev`. It MUST additionally compare the recomputed chain head to `integrity.ledger_head` in the local well-known file (§06); a mismatch is `AGSC-E701` even when every line links correctly, which is what detects a truncated tail. A published file whose lines differ from the recomputation of the same history is `AGSC-E702`, and a history too shallow to recompute is `AGSC-E703` with exit 2. [PRD-005, D48(1), D52(2)]
- **AGSC-08-24** The chain head MUST be published in the well-known file's `integrity.ledger_head` (§06) and attested at release. [PRD-024, D44(h)]
- **AGSC-08-25** Monthly `usage.cost_usd` MUST be rolled up on the NOW page as a visible spend line; launch lanes MUST contain no model call. [NFR-11 ← D14, Art. XV]

- **AGSC-08-26** (`auto` channel merges, added 2026-09-03 as a duplicate `AGSC-08-25`, renumbered by D52(4)) A merge without a fresh human `verified[]` entry is permitted ONLY when **all** of these hold, every one checked by CI against configuration or forge identity and none against self-declared frontmatter:
  (a) the pull request carries the label `channel:auto`;
  (b) the diff is confined to `content/**` items of `type ∈ concept|episode|lesson|procedure` — config, workflows, schemas, Gates and every other path fall back to `hitl`;
  (c) the pull-request author equals the channel's registered forge identity `channels[].author`, and the head commit carries the trailer `Ingested-by: <channel>`;
  (d) each changed item's `prov.operator` equals `channels[].owner` **from `agsc.config.json`**, and carries `prov.agent` (the adapter or client id) with `prov.origin` = `imported` (ingest) or `ai-generated` (`remember`) — never `human`, so AGSC-08-14 runs the N9 lints at `error` severity;
  (e) lint reports no `error`, the injection, secrets and PII lints included;
  (f) the merge is performed by the channel owner's fine-grained credential `CHANNEL_TOKEN_<name>` in the `auto-merge` job of `review.yml`, with the ruleset bypass limited to that actor — never `GITHUB_TOKEN`.
  The merge commit MUST carry `Channel-Auto: <name>`, which is what puts `mode: "auto"` on the derived ledger entry (AGSC-08-20a). This is the single exception admitted by AGSC-08-02 and AGSC-08-08. [PRD-056, D51-c ← D52(4), AGSC-01-31, N9, V3-28, V3-29, V3-30]
