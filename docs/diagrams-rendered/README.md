# `docs/diagrams-rendered/` — the diagrams as pictures

**Summary.** One SVG for every Mermaid block of [`docs/diagrams/`](../diagrams/README.md), named `<file>-<n>.svg` for the n-th block of `<file>.md`, for readers whose viewer cannot render Mermaid, and `render.js`, the script that writes them.

**Read after:** [docs/diagrams/README.md](../diagrams/README.md), section "Rendered pictures".

The Mermaid source is the truth; these pictures are derived and are never edited by hand. A maintainer renders them offline with a headless browser installed outside the repository (the header of `render.js` gives the command), and renders a diagram again in the same change set as its source. CI renders nothing. The pictures sit outside `docs/diagrams/` so that the npm package, which ships that folder, does not carry them.
