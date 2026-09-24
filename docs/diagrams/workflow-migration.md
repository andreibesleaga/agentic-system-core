# Workflow — migration from the old site (audit/D §1.5, D47 migration gate)

**What this shows.** The one-time migration of the previous site into a Bundle: the import, the field map it applies, the clean-room decisions it forces, and the clean `agsc lint` the result must reach before it is committed.

```mermaid
flowchart TD
  A["Old site repo:\nschema/content.schema.json, content/patterns/*.md,\ndecks.json, releases.json"]
  A --> B["agsc import --from old-site <path-to-old-site-repo>"]
  B --> C["Field map applied (audit/D S1.5):\nid->slug, summary->description,\ndeck/subdeck->clusters[], references[]->sources[],\nstatus:published->stable"]
  C --> D{"bookRef present\nand non-empty?"}
  D -- yes --> E["Importer REFUSES the card (W1/W11)"]
  E --> G["Owner fixes the source card,\nre-runs import"]
  G --> C
  D -- no --> F["Card accepted"]

  F --> H["Maintainer-approved 10-card\nre-summarization sample (D47 migration gate)"]
  H --> I{"OWNER GATE:\nsample approved?"}
  I -- no --> J["Revise mapping / summaries,\nre-run the 10-card sample"]
  J --> H
  I -- yes --> K["Batch import: all 153 cards\n(140 pattern + 7 taxonomy + 6 explainer)"]

  K --> L["66 status:stable / release:launch render;\n87 draft stay dark"]
  K --> M["110 Cluster files generated\n(84 subdeck + 20 deck + 6 family)"]
  K --> N["153 .diagram sources -> content/diagrams/;\nrecompiled by the ported DSL->SVG compiler"]

  L --> O["agsc lint"]
  M --> O
  N --> O
  O --> P{"Lint clean?"}
  P -- no --> Q["Fix importer or source data;\nre-run (deterministic + idempotent:\nre-run with no changes = no-op)"]
  Q --> C
  P -- yes --> R["Owner commits the imported Bundle ONCE;\nold repo is never read again"]
```

The `bookRef` refusal is structural, not a lint warning — it is the clean-room boundary (W1/W11): no
card carrying a book reference can enter the public Bundle at all. The owner gate sits after field
mapping but before the 153-card batch, per D47 ("migration gate = maintainer-approved 10-card
re-summarization sample"); everything downstream of the gate (batch import, 110 Clusters, diagram
recompilation) runs unattended and must land on a clean `agsc lint` before the one-time commit.

Trace: PRD-021 · audit/D §1.5, §1.1 (Cluster row) · D47 (migration gate), D08/Art. XIII (W1/W11 clean room).
