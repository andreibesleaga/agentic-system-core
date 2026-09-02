# Domain schema — item model (audit/D §1.2)

```mermaid
classDiagram
  class Bundle {
    +string spec_version
    +string okf_version
    +string title
    +string description
    +string base
  }

  class Item {
    <<abstract>>
    +string type
    +string title
    +string description
    +string status
    +string release
    +string[] tags
    +string[] aliases
    +string[] clusters
    +string lang
    +string date
    +string modified
    +string generated
    +Verified[] verified
    +string stale_after
    +string id
    +string iri
  }

  class Concept {
    +string kind
    +string evidence
    +string maturity
    +string mapping
    +bool signature
    +string[] signature_elements
    +string[] owasp_ids
    +string[] domains
    +string[] modality
    +string[] deployment
    +Implementation[] implementations
    +Diagram diagram
  }

  class Episode {
    +string started
    +string ended
    +string actor
    +string outcome
    +string[] refs
  }

  class Procedure {
    +string when
    +string[] inputs
  }

  class Lesson {
    +string severity
    +string derived_from
  }

  class Cluster {
    +string broader
    +int order
    +string family
  }

  class Gate {
    +string level
    +string[] checks
    +string[] enforce
  }

  class Source {
    +string resource
    +string title
    +string author
    +string year
    +bool verified
    +string grade
  }

  class Prov {
    +string origin
    +string agent
    +string model
    +string operator
    +string agreement
  }

  class Harness {
    <<generated-only>>
    +string harness_jsonld
    +string AGENTS_md
    +string workspace_dsl
    +string diagram_mmd
    +string arc42_md
    +string decisions_md
    +string skill_md
  }

  Bundle "1" *-- "0..*" Item : contains
  Item <|-- Concept
  Item <|-- Episode
  Item <|-- Procedure
  Item <|-- Lesson
  Item <|-- Cluster
  Item <|-- Gate
  Item "1" *-- "0..*" Source : sources[] (inline, no own file)
  Item "1" -- "1" Prov : prov (required, Gate L2)

  Item --> Item : related (symmetric / related)
  Item --> Item : broader (inverse / narrower)
  Item --> Item : narrower (inverse / broader)
  Item --> Item : uses (inverse / used-by)
  Item --> Item : requires (inverse / required-by, hard closure)
  Item --> Item : excludes (symmetric / excludes, mutex)
  Item --> Item : derived-from (inverse / derivation-of)
  Item --> Item : contradicts (symmetric / contradicts, warn)
  Item --> Item : supersedes (inverse / superseded-by, hides)

  Item ..> Harness : compose emits (never stored under content/)
```

`Item` is the common frontmatter shape (audit/D §1.2 "Common to all items"); the six concrete types
add only the fields in their own table row — no type inherits another type's specific fields. `Source`
has no own file at v1 (inline `sources[]` only). `prov` is required (Gate L2); `prov.commit`/`reviewer`
are deliberately absent here — they are derived at build from git log + `verified[]`, never stored
(G35). All nine Link keys are authored as slug arrays on the item; every inverse shown is computed at
build, never authored. `Harness` is generated-only and is never a Bundle member (audit/D §1.1).

Trace: PRD-002, PRD-037, PRD-042 · audit/D §1.1, §1.2, §1.3 · PLAN.md §5.1 (`src/knowledge/`).
