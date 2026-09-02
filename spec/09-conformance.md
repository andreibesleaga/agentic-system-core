# AGSC-09 — Conformance: classes, vectors, error codes, CLI contract

## 9.1 Classes and claims

- **AGSC-09-01** The classes are **reader**, **writer** and **full engine**, defined in AGSC-00-09…11. A claim MUST name the class, the `spec_version` MAJOR.MINOR, and the vector set passed. [PRD-010, D38-final]
- **AGSC-09-02** A conformance run MUST execute every `required` vector of the declared areas and MUST report `pass`, `fail` or `skip` per vector id. A `skip` counts as a failure for a required vector. [research/12 §1]
- **AGSC-09-03** A `conformance-report.json` MAY be published as `{impl, version, spec_version, class, results:[{id, status, got?}], summary}`; the `conform` runner and a public cross-implementation page are out of scope at 1.x. [D38-final, G26]

## 9.2 Vector format

- **AGSC-09-04** A vector is one JSON file under `tests/vectors/<area>/` containing one object with members `id`, `area`, `rule`, `level`, `description`, `input`, OPTIONAL `options`, and `expected`. Areas are `frontmatter/`, `slug/`, `links/`, `jcs/`, `graph/`, `lint/`, `cli/`, plus `bundle/`, `prov/`, `ledger/`, `compose/`, `build/`, `discovery/`, `import/`, `export/`, `skills/`. [PLAN §5.3, research/12 §H]
- **AGSC-09-05** `rule` MUST cite one rule id of this specification. `level` is `required` or `optional`. A **negative** vector's `expected` MUST be exactly `{"error": "AGSC-E<nnn>"}` — an error *code*, never a message. [research/12 §H]
- **AGSC-09-06** Vector files MUST be UTF-8, LF-terminated, NFC, I-JSON, with object members in JCS order (§04); they MAY be pretty-printed for review. They MUST be consumable without executing any code from this repository, so that a port in any language can run them directly. [NFR-02 ← D47]

## 9.3 CLI contract

- **AGSC-09-07** The verb set is exactly thirteen: `init`, `lint`, `build`, `verify`, `ci`, `export`, `import`, `compose`, `propose`, `review`, `refresh`, `skills`, `mcp`. Any other verb MUST exit 2 with `AGSC-E001`. [PRD-001 ← D41, R54]
- **AGSC-09-08** Exit codes: **0** success; **1** findings, a failed gate or a non-reproducible build; **2** usage error (unknown verb, unknown flag, missing argument, invalid configuration). [PRD-007, PLAN §8]
- **AGSC-09-09** Global flags `--json`, `--quiet`, `--plain`, `--no-input`, `--version` MUST be honoured, as MUST `NO_COLOR` and `AGSC_*` environment variables. Precedence is flags > environment > project configuration > user configuration. [PRD-007 ← R54, R30]
- **AGSC-09-10** Data goes to stdout; diagnostics go to stderr. Under `--json`, stdout MUST carry exactly one JCS-canonical envelope and stderr MUST carry one JSON object per line, one per finding. [PLAN §8]
- **AGSC-09-11** The envelope shape is:

```json
{ "counts": { "error": 0, "warn": 0 },
  "findings": [],
  "schema": "agsc.diagnostics.v1",
  "spec_version": "1.0.0-draft.1",
  "status": "pass",
  "verb": "lint",
  "version": "0.1.0" }
```

A finding is `{ "code": "AGSC-E301", "col": 1, "file": "content/concepts/a.md", "line": 12, "message": "…", "severity": "error", "slug": "a" }`. `status` ∈ `pass|fail`. [PRD-003, PRD-007]

- **AGSC-09-12** `--json` is REQUIRED for `lint` and `ci` at 1.x and SHOULD be available on every verb. [PRD-007, PLAN §11]
- **AGSC-09-13** `mcp` MUST expose exactly five tools — `search`, `read`, `links`, `compose`, `propose` — over stdio JSON-RPC, MUST NOT write non-protocol bytes to stdout, MAY log to stderr, and SHOULD exit on stdin EOF. [PRD-023 ← D41, audit/G §1 MCP row]
- **AGSC-09-14** `verify` MUST build twice and compare bytes; `verify --ledger` MUST re-verify the hash chain offline. [PRD-004, PRD-005]

## 9.4 Error-code registry

Codes are `AGSC-E<nnn>`; the hundreds digit is the area of PLAN §8 (`0` CLI, `1` PARSE, `2` SCHEMA, `3` LINK, `4` LINT, `5` PROV, `6` DET, `7` LEDGER, `8` COMPOSE, `9` IO).

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
| `AGSC-E201` | schema validation failed | AGSC-00-09 |
| `AGSC-E202` | required key missing | AGSC-02-07 |
| `AGSC-E203` | value outside enum or `tags.allowed` | AGSC-01-21 |
| `AGSC-E204` | pattern violation (slug, `iri`, instant) | AGSC-01-10 |
| `AGSC-E205` | `type` does not match folder | AGSC-01-03 |
| `AGSC-E206` | slug not unique in Bundle | AGSC-01-11 |
| `AGSC-E207` | unknown key (warning) | AGSC-02-05 |
| `AGSC-E301` | link target unresolved | AGSC-03-02 |
| `AGSC-E302` | cycle in `requires` | AGSC-03-07 |
| `AGSC-E303` | cycle in `broader`/`narrower` | AGSC-03-08 |
| `AGSC-E304` | unknown link key (warning) | AGSC-03-03 |
| `AGSC-E305` | orphan item (warning) | AGSC-03-10 |
| `AGSC-E306` | computed inverse authored | AGSC-03-04 |
| `AGSC-E401` | agent-directed imperative, blob or non-http scheme | AGSC-08-13 |
| `AGSC-E402` | hidden text | AGSC-08-13 |
| `AGSC-E403` | secret detected | AGSC-08-15 |
| `AGSC-E404` | personal data outside `prov`/`sources[]` | AGSC-08-16 |
| `AGSC-E405` | clean-room violation | AGSC-08-17 |
| `AGSC-E406` | expected body section missing (warning) | AGSC-02-21 |
| `AGSC-E407` | executable content in a skill pack | AGSC-07-15 |
| `AGSC-E501` | `prov` missing | AGSC-08-01 |
| `AGSC-E502` | `prov.origin` invalid | AGSC-02-07 |
| `AGSC-E503` | `prov.operator` missing | AGSC-08-01 |
| `AGSC-E504` | DCO-Plus trailer missing or malformed | AGSC-08-06 |
| `AGSC-E505` | agent-authored change without matching operator | AGSC-08-07 |
| `AGSC-E601` | JSON artefact not JCS-canonical | AGSC-04-06 |
| `AGSC-E602` | build not byte-reproducible | AGSC-04-02 |
| `AGSC-E603` | `SOURCE_DATE_EPOCH` malformed | AGSC-04-09 |
| `AGSC-E604` | emitted text not NFC | AGSC-04-07 |
| `AGSC-E605` | blank node in an RDF export | AGSC-05-08 |
| `AGSC-E701` | ledger chain broken | AGSC-08-23 |
| `AGSC-E702` | ledger rewritten or out of order | AGSC-08-23 |
| `AGSC-E801` | `excludes` conflict after closure | AGSC-07-06 |
| `AGSC-E802` | composition target missing | AGSC-07-03 |
| `AGSC-E803` | `contradicts` or missing `uses` (warning) | AGSC-07-07 |
| `AGSC-E901` | file not found | AGSC-01-01 |
| `AGSC-E902` | path escapes the Bundle root | AGSC-01-16 |
| `AGSC-E903` | archive refused | AGSC-01-16 |
| `AGSC-E904` | size cap exceeded | AGSC-01-16 |

- **AGSC-09-15** Codes are permanent. A retired code MUST NOT be reused; new codes take the next free number in their block. [AGSC-00-16]

## 9.9 Independent validation tooling (added 2026-09-02, S01 Amendment 2)
- **AGSC-09-90** A conforming distribution MUST include the `tools/` validators of PRD-054, each runnable standalone (no engine import beyond stdlib), so that every normative artifact (schemas, spec text, ontology, vectors, well-known file, features, diagrams) is checkable by an independent party. [PRD-054]
- **AGSC-09-91** `tools/validate-spec` MUST fail on: duplicate rule id; a rule id referenced but undefined; an error code used in spec/01–08 but absent from the §9 registry; a MUST/SHOULD sentence with no rule id; a trace tag naming a nonexistent PRD/D id. [PRD-054, NFR-03]
- **AGSC-09-92** CI MUST run all validators on every PR; a validator failure blocks merge like any Gate. [PRD-054, PRD-049]
