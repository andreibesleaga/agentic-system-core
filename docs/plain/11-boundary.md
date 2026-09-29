# 11 — Boundary, in plain language

**Where it applies.** Every place a node meets something outside itself: a browser reading across origins, another node, a URL somebody else typed, a reader who may not be allowed to see everything. All of it is static and client-side — nodes never call nodes.

**Parameters.** Every number and every list in this chapter lives in the configuration file with a default and a maximum; a reader that meets a value it does not know treats it as the most restrictive one and never fails.

**Cross-origin.** Public artefacts are readable from any origin; a restricted node still publishes its discovery file, and nothing else, that way.

**Federation, nine parts.** Declare peers; check them mutually; fetch only over HTTPS; refuse every private, local and special-purpose address, connect only to what you checked, follow few redirects; walk with a hop limit, a fan-out cap and a request budget; mark everything from a peer *untrusted* with its origin; cite across nodes through sources, never through links; query across dumps on the client; publish where proposals go; merge boards by IRI.

**Plugins.** Every agent surface — llms.txt, chunks, the local MCP server, WebMCP page tools, an optional Agent Card, a Solid pod, a remote responder — is declared in the discovery file with its external version and access class, must have its bytes pinned and proved, inherits the safety floor, and is checked against what is actually served.

**Hooks for later.** A node can be public or restricted today. A remote responder that speaks MCP is served now; one that speaks another protocol is declared now and built later, and encrypted Bundles and per-item visibility are left to a later version. A retired item keeps its address; a node that stops publishing leaves a tombstone.

Rules: `spec/11-boundary.md`, `AGSC-11-01` … `AGSC-11-23`. Threats and what stays open: `docs/SECURITY-CONSIDERATIONS.md`.
