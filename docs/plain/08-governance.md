# 08 — Governance, in plain language

**Provenance on everything.** Every item says how it came to be — human, ai-assisted, ai-generated or imported — with the operator accountable for it and, when a model wrote it, which model.

**Changes are proposals.** Nobody writes to the published branch directly, agents included. A change is a pull request with a DCO-Plus trailer; gates run as CI checks; a human ratifies. One narrow, configured, revocable exception exists for a trusted automatic channel.

**Agent safety.** Four lints run on every build: an injection scan over bodies, frontmatter at any depth, attachment text and every prose export; a clean-room check; a check that skills stay inert; and a staleness check. Every text handed to a model is marked *untrusted*.

**The ledger.** A hash chain derived from git history — never appended by hand — whose head is pinned in the discovery file. It proves the published history was not altered; it does not prove who the author was.

Rules: `spec/08-governance.md`, `AGSC-08-01` … `AGSC-08-27`.
