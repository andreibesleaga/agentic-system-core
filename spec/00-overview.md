# AGSC-00 — Overview, terms, conformance model

`spec_version: "1.0.0-rc.2"`. The key words MUST, MUST NOT, REQUIRED, SHALL, SHOULD, SHOULD NOT, MAY are to be interpreted as described in BCP 14 (RFC 2119, RFC 8174) when, and only when, they appear in capitals. Each rule has a stable id `AGSC-<section>-<nn>`; ids are never reused or renumbered. Trailing brackets cite the requirement each rule serves.

## 0.1 Scope

- **AGSC-00-01** This specification — `spec/00`…`spec/10`, `schema/{item,bundle,config}.schema.json`, `ontology/agsc.ttl` and `tests/vectors/**` — is the definition of AgenticSystemCore. An implementation MUST NOT rely on behaviour that these files do not pin, and any behaviour observable only in a particular engine is a defect of that engine, not of this specification. [NFR-02 ← D47, Art. XI]
- **AGSC-00-02** This specification defines a file format, a graph projection, a set of published surfaces, a governance contract and a CLI contract. It does not define a network protocol, a server, a database or a reasoner. [PRD non-goals ← D09, D43]
- **AGSC-00-03** Where a rule and a `tests/vectors/**` entry disagree, the rule is normative and the vector MUST be corrected by the procedure of AGSC-00-16 (new versioned file; the wrong file republished as `withdrawn`). [NFR-02, D48(7)]

## 0.2 Terms

- **AGSC-00-04** **Bundle** — one directory tree of Markdown items plus exactly one `agsc.config.json`; the unit of publication and of conformance. [D41]
- **AGSC-00-05** **Item** — one `.md` file with YAML frontmatter whose `type` is one of `concept`, `episode`, `procedure`, `lesson`, `cluster`, `gate`. "Item" is a term of this specification only; no common superclass exists in the ontology (§05). [D41, D36-final]
- **AGSC-00-06** **Concept** (with a `kind` qualifier), **Episode**, **Procedure**, **Lesson**, **Cluster**, **Gate** are the six item types. **Link**, **Source**, **Proposal**, **Review**, **Bundle**, **Harness** complete the ubiquitous language; Proposal and Review have no file (they are a forge pull request and its `verified[]` evidence), Source is an inline `sources[]` entry, and a Harness is generated output only. [D36-final, D41, audit/D §1.1]
- **AGSC-00-07** **NOW** is generated context, never an item and never hand-edited. [R29, D44(a)]
- **AGSC-00-08** **Card**, **page**, **deck** and **note** are UI or import vocabulary; they MUST NOT appear as a `type`, a schema key or an ontology term. [D36-final]

## 0.3 Conformance classes

- **AGSC-00-09** A **reader** MUST implement §01–§03 and §05 read-side: locate items, parse the frontmatter subset, validate against `schema/item.schema.json`, resolve the fourteen Link keys — nine core + five Mode-2, only the core nine driving composition — and compute their inverses. A reader MUST pass every `required` vector in the areas `frontmatter/`, `slug/`, `links/`. [PRD-002, PRD-003]
- **AGSC-00-10** A **writer** MUST implement §04, §05 and §06: canonical JSON, the four RDF views, the route set and the discovery files. A writer MUST pass every `required` vector in `jcs/`, `graph/` and `discovery/`, and MUST be a conforming reader. [PRD-004, PRD-022, PRD-024]
- **AGSC-00-11** A **full engine** MUST additionally implement §07 (composition), §08 (governance) and §09 (CLI contract) and MUST pass every `required` vector in every area. [PRD-036, PRD-042, PRD-001]
- **AGSC-00-12** An implementation claiming conformance MUST state its class — that is, its **Level** of AGSC-10-01…06, the one claim vocabulary (reader = Level 1, writer = Level 2, full engine = Level 3, publisher = Level 0) — its `spec_version` and the vector set it passed. It MUST NOT claim a class whose vectors it does not pass. [PRD-010, D38-final]
- **AGSC-00-13** Optional vectors (`"level": "optional"`) MAY fail without losing conformance; they cover SHOULD-level rules. A `withdrawn` vector (AGSC-00-16) is excluded from every class's required set and MUST NOT be run for a conformance claim. [research/12 §1, D48(7)]

## 0.4 Versioning

- **AGSC-00-14** `spec_version` is SemVer 2.0.0. MAJOR means a file valid under the previous MAJOR MAY fail validation; MINOR adds optional keys, enum values, link semantics or vectors; PATCH clarifies text or adds vectors that conforming implementations already pass. [research/12 §8]
- **AGSC-00-15** A reader MUST accept any Bundle whose `spec_version` MAJOR equals its own, MUST tolerate unknown keys and unknown link keys, and MUST NOT reject a file for them. [research/12 §P rules 11, 13; OKF v0.2]
- **AGSC-00-16** Released spec sections, JSON-LD context files and vector files are immutable; a change creates a new versioned file. A vector that AGSC-00-03 shows to be wrong MUST NOT be edited in place: the corrected case ships as a new versioned vector file and the superseded file is retained with its `level` republished as `withdrawn`; `withdrawn` vectors are excluded from every class's required set. Ontology terms are never deleted — they are marked `owl:deprecated true` with `dcterms:isReplacedBy`. [research/12 §P rules 41, 42; D48(7)]
- **AGSC-00-17** `spec_version` MUST appear in the Bundle root `content/index.md` and in `agsc.config.json`; it MAY appear per item and, when present, MUST have the same MAJOR. [research/12 §P rule 13]

> **rc.3 amendment (2026-09-16, D71):** AGSC-00-01 reads `spec/00`…`spec/11` — `spec/11-boundary.md` (the node boundary: cross-origin access, federation, contribution, surfaces, visibility, retirement) is part of the definition from `1.0.0-rc.3`. Its vector area is `boundary` (`bnd-nnnn`).
