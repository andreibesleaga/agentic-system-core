# AGSC-09 — Conformance: classes, vectors, error codes, CLI contract

## 9.1 Classes and claims

- **AGSC-09-01** The classes are **publisher**, **reader**, **writer** and **full engine**, defined in AGSC-00-09…11 and numbered as the Levels 0–3 of AGSC-10-01…06 — one claim vocabulary, two names for the same thing. A claim MUST name the class as its Level, the `spec_version` MAJOR.MINOR, and the vector set passed. [PRD-010, D38-final]
- **AGSC-09-02** A conformance run MUST execute every `required` vector of the declared areas and MUST report `pass`, `fail` or `skip` per vector id. A `skip` counts as a failure for a required vector. [research/12 §1]
- **AGSC-09-03** A `conformance-report.json` MUST be producible by `agsc conform` as `{impl, version, spec_version, class, results:[{id, status, got?}], summary}`, and a node MAY publish it at `/conformance/` together with a table of third-party claims. A published claim is the claimant's own assertion; this specification defines no arbitration. [D38-final, D53, G26 lifted]

## 9.2 Vector format

- **AGSC-09-04** A vector is one JSON file under `tests/vectors/<area>/` containing one object with members `id`, `area`, `rule`, `level`, `description`, `input`, OPTIONAL `options`, OPTIONAL `reason` (REQUIRED when `level` is `withdrawn`: why the case was withdrawn and which vector supersedes it), OPTIONAL `note` (editorial provenance of an unreleased vector; never read by a conformance run), and `expected`. Areas are `frontmatter/`, `slug/`, `links/`, `jcs/`, `graph/`, `lint/`, `cli/`, plus `bundle/`, `prov/`, `ledger/`, `compose/`, `build/`, `discovery/`, `adopt/`, `import/`, `export/`, `skills/`, `adapters/`, `channels/`, `harness/`, `run/`, `conform/` — **twenty-two**, and no others. `webmcp/` is not an area: AGSC-09-16 is proved by `cli/cli-0003`, so a permanently empty declared area would be a false promise (V5-3 S3-36). `adapters/`, `channels/` and `harness/` are declared here so that the milestones that populate them need no `spec_version` change (V5-3 S3-21). [PLAN §5.3, research/12 §H, V2 §4]
- **AGSC-09-05** `rule` MUST cite one rule id of this specification. `level` is `required`, `optional` or `withdrawn` (AGSC-00-16); a `withdrawn` vector MUST NOT be counted for or against any conformance claim, MUST carry `reason`, and MUST have `expected` reduced to `{"withdrawn": true}` so that a superseded expectation can never be read as normative. A **negative** vector's `expected` MUST carry the member `error` whose value is an `AGSC-E<nnn>` **code**, never a message; it MAY additionally carry `severity`, `exit`, `stdout`, `line`, `cycle`, `chain` or `parents`, and a vector asserting several outcomes MAY nest an `error` member inside a named sub-object (`graph-0005`). [research/12 §H, D48(7)]
- **AGSC-09-06** Vector files MUST be UTF-8, LF-terminated, NFC, I-JSON, with object members in JCS order (§04); they MAY be pretty-printed for review. They MUST be consumable without executing any code from this repository, so that a port in any language can run them directly. [NFR-02 ← D47]

## 9.3 CLI contract

- **AGSC-09-07** The verb set is exactly **sixteen**: `init`, `lint`, `build`, `verify`, `ci`, `export`, `import`, `compose`, `propose`, `review`, `refresh`, `skills`, `mcp`, `run`, `trace`, `conform`. `run` and `trace` MUST be opt-in and disabled by default (AGSC-01-18 `run.enabled`, default `false`); `conform` executes the vector set of a declared Level (AGSC-10-01) and writes the AGSC-09-03 report. Any other verb MUST exit 2 with `AGSC-E001`. [PRD-001 ← D41, R54, D53, V4-A A-45]
- **AGSC-09-08** Exit codes: **0** success; **1** findings, a failed gate or a non-reproducible build; **2** usage error (unknown verb, unknown flag, missing argument, invalid configuration — including a malformed `SOURCE_DATE_EPOCH`, `AGSC-E603`, which is an environment/configuration fault and never a finding). [PRD-007, PLAN §8, D48(7)]
- **AGSC-09-09** Global flags `--json`, `--quiet`, `--plain`, `--no-input`, `--version` MUST be honoured, as MUST `NO_COLOR` and `AGSC_*` environment variables. Precedence is flags > environment > project configuration > user configuration. [PRD-007 ← R54, R30]
- **AGSC-09-10** Data goes to stdout; diagnostics go to stderr. Under `--json`, stdout MUST carry exactly one JCS-canonical envelope and stderr MUST carry one JSON object per line, one per finding. `findings[]` in the envelope, and the stderr lines, MUST be ordered by `(file, line, col, code)` compared code-point-wise, so that a byte comparison of the output is stable however the lint phases were scheduled. [PLAN §8, D48(3)]
- **AGSC-09-11** The envelope shape is:

```json
{ "counts": { "error": 0, "warn": 0 },
  "findings": [],
  "schema": "agsc.diagnostics.v1",
  "spec_version": "1.0.0-rc.2",
  "status": "pass",
  "verb": "lint",
  "version": "0.1.0" }
```

A finding is `{ "code": "AGSC-E301", "col": 1, "file": "content/concepts/a.md", "line": 12, "message": "…", "severity": "error", "slug": "a" }`. `status` ∈ `pass|fail`. [PRD-003, PRD-007]

- **AGSC-09-12** `--json` is **REQUIRED on every verb** at 1.0 and MUST emit the AGSC-09-11 envelope; the `lint` and `ci` envelopes additionally carry `findings[]` ordered per AGSC-09-10. [PRD-007, PLAN §11 ← V5-3 S3-32]
- **AGSC-09-13** `mcp` MUST expose exactly **seven** tools — `search`, `read`, `links`, `compose`, `propose`, `ask`, `remember` (the last two per AGSC-09-14a/14b; amended 2026-09-03, D51-b) — over stdio JSON-RPC, MUST NOT write non-protocol bytes to stdout, MAY log to stderr, and SHOULD exit on stdin EOF. [PRD-023 ← D41, audit/G §1 MCP row]
- **AGSC-09-13a** **Tool error envelope.** A tool that cannot fulfil a call MUST return the AGSC-08-18 envelope with `type: "error"`, `trust: "untrusted"`, `license` as usual, and `body` = the JSON object `{ "code": "AGSC-E<nnn>", "message": "…" }`; `source` names the tool. It MUST NOT signal a domain fault as a JSON-RPC transport error — those are reserved for protocol faults (bad method, malformed params). The shape is identical on the stdio and WebMCP transports, which is what makes the byte-identity of AGSC-09-16 hold for failing calls as well as succeeding ones; `message` text is unspecified so that ports may localise it, and only `code` is asserted (AGSC-09-06). `cli/cli-0004` is its vector. [PRD-023, PRD-051 ← V5-3 S3-16, AGSC-08-18, AGSC-09-11]
- **AGSC-09-14** `verify` MUST build twice and compare bytes; `verify --ledger` MUST re-verify the hash chain offline. [PRD-004, PRD-005]
- **AGSC-09-14a** A **Channel responder** (`ask`) answers questions using only the Bundle's published exports (a Level-1 reader over `search.json`/`graph.jsonld`/`pages/*.md`, or the local MCP tools `search read links`). Its result MUST be the AGSC-08-18 envelope — `{source, trust: "untrusted", license, type, body}` — with `body` = the answer and an added `citations[]` of item IRIs; every answer MUST cite ≥1 item IRI, MUST be exactly "no answer in this memory" when nothing matches, and MUST embed the Content Use Terms line. A responder MAY use an LLM only under the spend cap, and one that does MUST record its spend by emitting a `remember(kind: episode)` Proposal carrying `usage` — otherwise its spend never reaches the NOW rollup (AGSC-08-25) and the cap is unenforceable. Responders are plugins; none is required for conformance at any Level. [PRD-056, N9, D39, V3-34]
- **AGSC-09-14b** The MCP tool set is exactly `search read links compose propose ask remember` (seven; WebMCP MUST mirror it). `remember({kind, title, body, at, outcome?, severity?, sources?})` MUST synthesize a **conforming** item (AGSC-02): `type` from `kind`; slug from the title per the AGSC-02-91 slugifier with `-2`, `-3`, … collisions; `at` (an instant, REQUIRED for `episode`) supplies `started` — a clock is never read (AGSC-04-11); `outcome` defaults to `partial` and `severity` to `info`; a `concept` gets `kind: explainer`; `actor` is the client's declared agent actor string (AGSC-02-09); `prov.operator` = the client's declared human operator, `prov.agent`/`prov.model` = the client's declared identity, and `prov.origin: ai-generated` unless the client asserts `human`. It hands the item to the Proposal path (AGSC-08) under the client's channel `publish` mode (AGSC-01-31, default `hitl`) and MUST NOT write to the content branch. The server MUST also expose every item as an MCP resource (`text/markdown`), `graph.jsonld` and `llms.txt`, and one prompt "answer from this memory with citations". A client-supplied `sources[]` entry MUST be validated before the item is synthesized: `resource` MUST match the AGSC-02-10 grammar (`https?://…` or `urn:agsc:channel:<name>:<source_id>`) and MUST NOT carry any other scheme (`AGSC-E401`); every other member is truncated to its schema bound and NFC-normalized. An entry that fails MUST be dropped with `AGSC-E506`, never rejected as an error — `remember` is a total function like adoption (AGSC-02-90). [PRD-023, PRD-056, D51-b, N9, V3-33, V4-A A-68]

- **AGSC-09-16** **WebMCP.** Where a browser exposes `document.modelContext`, the `/compose/` and item pages MUST register the **same seven tools** as AGSC-09-13 through `document.modelContext.registerTool()`, with identical names, identical argument names and results byte-identical to the local MCP server's for the same input and Bundle — one tool contract, two transports (`cli-0003` compares the two manifests). Registration MUST be feature-detected: with no `document.modelContext` the page MUST work unchanged in plain JavaScript, and no tool may require a network call, a key or a server. On the WebMCP transport `propose` and `remember` are **local-only**: they MUST return the Proposal payload to the caller and MUST NOT perform any network write, MUST NOT read or honour `channels[].publish`, and the `auto` mode of AGSC-01-31 is unavailable to this transport — a browser page holds no configuration authority and no forge identity (AGSC-08-04, AGSC-08-26(f)). Byte-identity with the stdio transport (this rule's first sentence) is asserted over the returned payload, not over any side effect. [PRD-051 ← D53, D34, AGSC-09-13, V4-A A-64]

## 9.4 Error-code registry

Codes are `AGSC-E<nnn>` and nothing else; the hundreds digit is the area of PLAN §8 (`0` CLI, `1` PARSE, `2` SCHEMA, `3` LINK, `4` LINT, `5` PROV, `6` DET, `7` LEDGER, `8` COMPOSE, `9` IO). No other code format (`AGSC-<AREA>-<nnn>`, `AGSC-DET-nnn`) exists anywhere in this system; prose or a diagram using one is a defect of that document (D48(7)).

**Precedence.** Where two codes could name one fault, the more specific one wins: `AGSC-E203` is reported for every enum and `tags.allowed` violation, `AGSC-E204` for every pattern violation, and `AGSC-E201` only for a schema failure that no more specific registered code, **in any block**, names — a `maxItems` violation on a cluster's `broader` is `AGSC-E308`, not `AGSC-E201`. Two conforming engines therefore report the same code for the same input (D48(7)).

| Code | Meaning | Rule |
|---|---|---|
| `AGSC-E001` | unknown verb | AGSC-09-07 |
| `AGSC-E002` | unknown flag | AGSC-09-09 |
| `AGSC-E003` | missing argument | AGSC-09-08 |
| `AGSC-E004` | invalid or unknown configuration key | AGSC-01-18 |
| `AGSC-E101` | frontmatter missing | AGSC-02-01 |
| `AGSC-E102` | frontmatter not terminated | AGSC-02-01 |
| `AGSC-E103` | YAML anchor or alias | AGSC-02-02 |
| `AGSC-E104` | YAML tag or merge key | AGSC-02-02 |
| `AGSC-E105` | flow mapping or complex key | AGSC-02-02 |
| `AGSC-E106` | duplicate key | AGSC-02-02 |
| `AGSC-E107` | second YAML document | AGSC-02-01 |
| `AGSC-E108` | encoding violation (BOM, CRLF, non-NFC, trailing newline) | AGSC-01-14 |
| `AGSC-E109` | unsupported Markdown construct | AGSC-02-20 |
| `AGSC-E201` | schema validation failed (only where no 2xx code is more specific) | AGSC-00-09 |
| `AGSC-E202` | required key missing | AGSC-02-07, AGSC-08-01 |
| `AGSC-E203` | value outside enum or `tags.allowed` | AGSC-01-21 |
| `AGSC-E204` | pattern violation (slug, `iri`, instant) | AGSC-01-10 |
| `AGSC-E205` | file-placement violation (`type` does not match folder; language-variant suffix disagrees with `lang`, or `lang` is not lowercase BCP 47) | AGSC-01-03, AGSC-01-13 |
| `AGSC-E206` | slug not unique in Bundle | AGSC-01-11 |
| `AGSC-E207` | unknown key (warning) | AGSC-02-05 |
| `AGSC-E208` | language variant without a primary file | AGSC-01-13 |
| `AGSC-E301` | link target unresolved | AGSC-03-02 |
| `AGSC-E302` | cycle in `requires` | AGSC-03-07 |
| `AGSC-E303` | cycle in `broader`/`narrower` | AGSC-03-08 |
| `AGSC-E304` | unknown link key (warning) | AGSC-03-03 |
| `AGSC-E305` | orphan item (warning) | AGSC-03-10 |
| `AGSC-E306` | computed inverse authored | AGSC-03-04 |
| `AGSC-E307` | cluster nesting deeper than 3 | AGSC-03-22 |
| `AGSC-E308` | cluster has more than one `broader` | AGSC-03-22 |
| `AGSC-E309` | `memory://` names a foreign bundle — use the `https://` IRI | AGSC-05-04b |
| `AGSC-E310` | relative body link or image with no resolvable target inside the Bundle | AGSC-03-11 |
| `AGSC-E401` | agent-directed imperative, blob or non-http scheme | AGSC-08-13 |
| `AGSC-E402` | hidden text | AGSC-08-13 |
| `AGSC-E403` | secret detected | AGSC-08-15 |
| `AGSC-E404` | personal data outside `prov`/`sources[]` | AGSC-08-16 |
| `AGSC-E405` | clean-room violation | AGSC-08-17 |
| `AGSC-E406` | expected body section missing (warning) | AGSC-02-21 |
| `AGSC-E407` | executable content in a skill pack | AGSC-07-15 |
| `AGSC-E408` | concept or cluster carries no description (warning) | AGSC-02-21 |
| `AGSC-E409` | warned status transition, e.g. deprecated → stable (warning) | AGSC-02-23 |
| `AGSC-E410` | language variant diverges from its primary's Links or clusters (warning) | AGSC-01-13a |
| `AGSC-E501` | `prov` missing | AGSC-08-01 |
| `AGSC-E502` | `prov.origin` invalid | AGSC-02-07 |
| `AGSC-E503` | `prov.operator` missing | AGSC-08-01 |
| `AGSC-E504` | DCO-Plus trailer missing or malformed | AGSC-08-06 |
| `AGSC-E505` | agent-authored change without matching operator | AGSC-08-07 |
| `AGSC-E506` | adoption defaulted or normalized a value (warning) | AGSC-02-90 |
| `AGSC-E507` | adopted body reference no longer resolves after relocation (warning) | AGSC-02-95 |
| `AGSC-E601` | JSON artefact not JCS-canonical | AGSC-04-06 |
| `AGSC-E602` | build not byte-reproducible | AGSC-04-02 |
| `AGSC-E603` | `SOURCE_DATE_EPOCH` malformed (exit 2) | AGSC-04-09 |
| `AGSC-E604` | emitted text not NFC | AGSC-04-07 |
| `AGSC-E605` | blank node in an RDF export | AGSC-05-08 |
| `AGSC-E606` | build instant defaulted to 0, no git history (warning) | AGSC-04-09 |
| `AGSC-E701` | ledger chain broken | AGSC-08-23 |
| `AGSC-E702` | ledger rewritten or out of order | AGSC-08-23 |
| `AGSC-E703` | git history too shallow to derive the ledger (exit 2) | AGSC-08-20a |
| `AGSC-E706` | content-branch commit outside the merged-pull-request path, or the ingest identity holding ruleset bypass rights | AGSC-08-26 |
| `AGSC-E801` | `excludes` conflict after closure | AGSC-07-06 |
| `AGSC-E802` | composition target unavailable (slug absent from the graph; `requires` target hidden by `supersedes`) | AGSC-07-03, AGSC-07-05a |
| `AGSC-E803` | `contradicts` or missing `uses` (warning) | AGSC-07-07 |
| `AGSC-E901` | file not found | AGSC-01-01 |
| `AGSC-E902` | path escapes the Bundle root | AGSC-01-16 |
| `AGSC-E903` | archive refused | AGSC-01-16 |
| `AGSC-E904` | size cap exceeded | AGSC-01-16 |

- **AGSC-09-15** Codes are permanent. A retired code MUST NOT be reused; new codes take the next free number in their block. [AGSC-00-16]

## 9.9 Independent validation tooling (added 2026-09-02, S01 Amendment 2)
- **AGSC-09-90** The **reference** distribution MUST include the `tools/` validators of PRD-054, each runnable standalone (no engine import beyond stdlib), so that every normative artifact (schemas, spec text, ontology, vectors, well-known file, features, diagrams) is checkable by an independent party; any other distribution MAY substitute its own implementation of the same nine command contracts (same names, same flags, same AGSC-09-11 envelope, same codes), and a conformance claim names which it ran. A validator's `--json` output MUST be the AGSC-09-11 envelope with `verb` set to the tool's own name (`validate-spec`, `validate-schemas`, `validate-ontology`, `validate-vectors`, `validate-wellknown`, `validate-features`, `validate-diagrams`, and the generators `gen-spec-html` and `gen-ns`) and `version` set to the tool distribution's own package version (the envelope's `spec_version` member already carries the version validated against, so the two never duplicate); findings use the same finding object, the same `(file, line, col, code)` ordering (AGSC-09-10) and the same `AGSC-E<nnn>` codes. Seven validators and two generators therefore speak one diagnostic language, and no tool invents a shape. No further validator may be added for a job an existing validator already carries: the federation check of AGSC-10-12 is the `--peer` flag of `tools/validate-wellknown`, never a separate binary (D32(5)). A declared vector area with no vector file is not a failure; `tools/validate-vectors` MUST report it as an informational count, and only a *required* vector's absence for a rule that names one is a failure. [PRD-054 ← V2-25, D32, V4-A A-40, A-44, A-76]
- **AGSC-09-91** `tools/validate-spec` MUST fail on: duplicate rule id; a rule id referenced but undefined; an error code used in spec/01–08 but absent from the §9 registry; a MUST/SHOULD sentence with no rule id; a trace tag naming a nonexistent PRD/D id; a code appearing in more than one registry row; a code used in `spec/01`–`08` whose registry row does not name the rule that raises it; a registry row naming a rule id that does not exist (grouped-fault rows such as `AGSC-E108` and `AGSC-E401` stay legal — the hundreds-digit block, not the row, is the unit of precision, V5-3 S3-14); a `spec_version` literal in `spec/`, `tests/vectors/**` or `docs/` that differs from the `spec/00` declaration; a rule id `<n>a` that does not immediately follow rule `<n>`. [PRD-054, NFR-03, V4-A A-21, A-32, A-37]
- **AGSC-09-92** CI MUST run all validators on every PR; a validator failure blocks merge like any Gate. [PRD-054, PRD-049]
- **AGSC-09-93** `tools/validate-wellknown <url|file>` MUST check: the response media type is `application/linkset+json` **or** a `Link: …; rel="profile"` header names the profile URI (AGSC-06-07); `linkset` is the sole top-level member; every relation name is registered or an `…/rel#<name>` extension URI of AGSC-06-10; every target attribute value is an array of strings; at `--level 0` the absence of every `digest`/`agsc-*` attribute is accepted, and at `--level 2` and above their presence is REQUIRED and each `digest` is recomputed over the fetched target. Its `--peer <url|file>` flag performs the mutual-conformance check of AGSC-10-12 and MUST accept two local files so the check runs with no network. Its `--json` output is the AGSC-09-11 envelope with `verb: "validate-wellknown"`. [PRD-054, D55, D57 Q14, V4-A A-07, A-76]
- **AGSC-09-94** `run` and `trace` are the two opt-in verbs of AGSC-09-07 and have no effect unless `run.enabled` is `true` in `agsc.config.json` (AGSC-01-18; default `false`); with it `false` both MUST exit 2 with `AGSC-E001`, exactly as an unknown verb. `run <slug>` executes the fenced blocks of a Procedure whose info string is `{run}` and compares each captured result with the immediately following `{expect}` block; `{run}`/`{expect}` are the only two executable info strings, they are permitted on `procedure` items only, and every other info string of AGSC-02-22 stays a rendering hint. Execution MUST be refused unless the command's program name is listed in `run.allow[]`; it MUST run with no network, no shell interpolation, a scrubbed environment and a timeout, and it MUST NOT write inside the Bundle. `--dry-run` MUST print the resolved command list and execute nothing. `trace <file.json>` is a **pure** function: it maps an already-captured agent-run record to an Episode item through the AGSC-01-22/AGSC-02-14 import path and executes no process. Neither verb may be required by any conformance Level (AGSC-10-01…06). [PRD-001 ← D53, D32(3), V4-A A-75]
