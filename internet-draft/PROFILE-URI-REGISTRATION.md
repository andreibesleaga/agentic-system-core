# Profile URI registration — ready to file (RFC 7284, First Come First Served)

*D82 Q23 (2026-09-17): the Profile URI registry (https://www.iana.org/assignments/profile-uris/) is First Come First Served and can be filed today, independently of the Internet-Draft. The owner files it from their own account (the assistant never submits anything). Five fields, exactly as the registration template of RFC 7284 §4 sets them out; the registration process is RFC 7284 §2 and the worked example is §3 (§4.1 is the registry's initial contents, not the template).*

*Re-verified live 2026-09-19: the registry page https://www.iana.org/assignments/profile-uris/ was last updated 2025-06-18 and states "Registration Procedure(s): First Come First Served (Specification Suggested)"; it lists nine entries and none of them is this URI or anything colliding with it. RFC 7284 §4: "The registration procedure for new entries requires a request in the form of the following template and is 'First Come First Served' per [RFC5226]." Neither RFC 7284 nor the registry page names a submission channel — the channel used is the IANA general assignment form (runbook Filing B).*

| Field | Value |
|---|---|
| **Profile URI** | `https://w3id.org/agentic-system-core/profile/agentic-knowledge` |
| **Common Name** | AgenticSystemCore knowledge link set profile |
| **Description** | Identifies an `application/linkset+json` document (RFC 9264) that describes a published knowledge Bundle: one link context whose anchor is the Bundle IRI, links to the Bundle's artefacts — graph serializations, a JSON-LD context, a vocabulary, a chunk export, an agent-facing text file, a change ledger — each optionally carrying a `digest` target attribute in the syntax of RFC 9530, and the bundle-fact and declaration target attributes this document defines. Served at `/.well-known/knowledge-linkset`; linked from pages with `rel="describedby"` and `type="application/linkset+json"`. |
| **Reference** | AgenticSystemCore specification `1.0.0-rc.5`, `spec/06-surfaces.md` §6.2 (AGSC-06-07…12) — https://agenticsystemcore.com/specs/agentic-knowledge/ (the 303 target of the profile URI); Internet-Draft `draft-besleaga-agentic-knowledge-wellknown` when posted |
| **Notes** | The profile does not change the semantics of `application/linkset+json` for a client that ignores it (RFC 6906 §3); it adds integrity and bundle-fact target attributes a client MAY use. Change controller: Andrei Nicolae Besleaga, Independent, andrei.besleaga.nicolae@gmail.com, ORCID 0009-0001-3464-5283. |

**Before filing:** the 303 target `/specs/agentic-knowledge/` must resolve on the live site (DS-7), because the registry's reviewers follow the Reference. **After filing:** record the registry entry date in `docs/SPEC.md` §4 and `FIRST-USE-EVIDENCE.md`; only then may any document say "registered" of the profile URI (AGSC-06-07 discipline).
