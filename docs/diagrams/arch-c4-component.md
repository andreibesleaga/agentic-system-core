# Architecture — C4 level 3: the engine's components

**What this shows.** Inside the engine: five bounded contexts, one supporting context,
the application layer, and the ports and adapters that are the only way out to files,
processes, the clock and the network. Arrows are the only permitted `require`
directions; `tests/arch/context-boundaries.test.js` enforces them.

```mermaid
flowchart TD
  A["Application layer<br/>config · CLI verbs · plugins · agsc-host"]
  K["Knowledge<br/>items · links · graph · chunks"]
  G["Governance<br/>prov · lints · ledger · boards"]
  C["Composition<br/>closure · Harness · skill packs"]
  D["Distribution<br/>pages · discovery · text files · tools · hosts"]
  BD["Boundary<br/>peers · visibility · surfaces"]
  I["Interchange<br/>foreign formats in and out"]
  P["Ports<br/>FileSystem · Clock · ProcessRunner · Network"]
  AD["Adapters (Node)"]
  S["Shared kernel<br/>the two orderings"]
  A --> K
  A --> G
  A --> C
  A --> D
  A --> BD
  A --> I
  A --> AD
  K --> G
  K --> C
  K --> D
  K --> BD
  K --> I
  G --> D
  G --> I
  C --> D
  BD --> D
  AD --> P
  AD --> S
  K --> S
```

Trace: AGSC-04-01 and AGSC-04-03 (determinism: the pure core, no network), AGSC-00-24
(where each plugin kind attaches), AGSC-09-07.
