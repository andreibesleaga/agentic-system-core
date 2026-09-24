# Security considerations

**Who this is for:** a security reviewer, an operator or an implementer. **Read after:** [spec/11-boundary.md](../spec/11-boundary.md). *(Header added 2026-09-24.)*

*Informative supplement to `spec/11-boundary.md` §11.8 and `docs/PLAN.md` §12. Written 2026-09-16 for the `1.0.0-rc.3` draft; re-verified against `1.0.0-rc.4` on 2026-09-18. Each row names the rule that closes it; what stays open is said plainly. This text is the source of the Internet-Draft's Security Considerations section.*

In one sentence: the discovery layer proves that the artefacts a reader fetched are the ones the
publisher described, never who the publisher is; the ledger proves that a published history was not
rewritten, never that what it records is true; and everything an agent lane produces is a proposal a
person can refuse. The tables below name what the rules defend against, what they do not, and why.

## 1. Threat rows added at rc.3 (continuing the STRIDE table of PLAN §12, T1–T10)

| # | Threat | STRIDE | Closed by | Residual |
|---|---|---|---|---|
| T11 | **Request forgery through peer fetch** — a hostile `peers[]` entry or a redirect steers the fetcher at an internal address (SSRF), including a DNS answer that flips between the check and the connect | S/T | AGSC-11-07 (HTTPS only, loopback only under `--dev`), 11-08 (every IANA special-purpose block refused, connect only to a classified address, re-verify the socket peer), 11-09 (`redirect_limit`, every hop re-checked), 11-10 (hop, fan-out and request caps) | an operator who runs the walk on a host with private services and a resolver that lies **after** connect; the socket re-check bounds it to one connection |
| T12 | **Exfiltration through cross-origin reads of a wrongly public restricted node** | I | AGSC-11-20 (wildcard withheld from every artefact but the discovery document), 11-03 (wildcard only when `visibility` is `public`), vector `bnd-0002` | misconfiguration: a publisher who marks a node `public` while gating content elsewhere; the conformance claim is asserted against the unauthenticated view, so the mismatch is visible |
| T13 | **Spam, injection and sender spoofing through contribute channels** — a published `mailto:` target is an open relay into the Proposal path | S/T | AGSC-11-14 (`hitl` only; every AGSC-01-30 guard; `allow[]` is not an authorisation control without DKIM/SPF alignment; `source_id` derived from the envelope), AGSC-08-13 (injection lints at error severity) | a verified sender who is malicious: caught by review, never by the format |
| T14 | **Surface spoofing** — a discovery document declares a surface it does not serve, or serves bytes that disagree with the declaration | S | AGSC-11-16…19 (declare · pin · inherit · prove; `AGSC-E210` on mismatch, `AGSC-E211` on an undeclared emission), vectors `bnd-0037/0013/0021` | a surface whose external specification moves under the declared version: the declaration names the version, so the disagreement is detectable |
| T15 | **Tombstone successor impersonation** — whoever takes over an expired domain points `alternate` at a node they control | S | AGSC-11-23 (a successor is never the same node; mutuality re-established; everything derived carries the successor's own origin) | a successor that is itself conforming and mutual but not the original author: **authorship needs signatures**, which 1.0 does not carry (§2) |
| T16 | **An SVG attachment as an injection or exfiltration carrier** — script, event handlers, foreign content, external references, entity expansion; the full SVG text enters the chunk export | T/I | AGSC-02-98 (allow-list: no `script`/`foreignObject`/`a`/`animate*`/`set`/`handler`/`style`, no `on*` attribute, no `DOCTYPE` or entity, no `data:` URI, every `href` a fragment or same-directory path), AGSC-08-13 (attachment text is an injection-scan input), AGSC-06-30 (release-gated and draft items excluded from the export), vector `lint-0024` | an SVG that is safe by the allow-list yet visually deceptive; a human reviews every attachment through the Proposal path |

Rows T1–T10 (prompt injection through merged content, w3id redirect tampering, repudiation, and the rest) are unchanged in `docs/PLAN.md` §12.

## 1a. Threat rows added at rc.4

| # | Threat | STRIDE | Closed by | Residual |
|---|---|---|---|---|
| T17 | **Runaway or captured agent lane** — a self-driving node whose agent loops on its own output, is steered by injected prose, or spends without bound | T/D/E (LLM01, LLM08) | AGSC-08-28 (Proposals only; declared types and tasks, `AGSC-E509`; prompt fenced as data; spend recorded; monthly budget per lane and node-wide, `AGSC-E510`; `max_new_items` and `max_claims`, `AGSC-E511`; credentials environment-only and a tracked `.env` is `AGSC-E403`, AGSC-01-37), AGSC-08-29 (every AGSC-08-26 guard; lints at `error`; no procedure, gate or configuration in the lane; `mode: auto` in the ledger), AGSC-08-30 (model-free build), AGSC-10-18 (slow lane unreachable), one configuration key to disable | an agent that produces plausible but wrong prose within the admitted types: caught by staleness, lessons and people reading, never by the format; the honest limit of AGSC-08-19 applies |

## 1b. Threat rows added at rc.5

| # | Threat | STRIDE | Closed by | Residual |
|---|---|---|---|---|
| T18 | **A `restricted` node's own discovery document as a content oracle** — the document stays world-readable at both visibility values, so a gated node was still publishing `agsc-counts` (per-type population), `agsc-bundle-hash` (a confirmation-of-content oracle: an attacker who guesses the Bundle confirms it byte-exactly without reading it) and `agsc-ledger-head` (commit activity), plus, since rc.6, `agsc-bundle-version` (whose untagged forms carry the commit count and the commit hash of the content branch, which is commit activity by another name —), plus a `digest` over every artefact it does not serve unauthenticated | I | AGSC-11-20 as amended at rc.5 and again at rc.6 (a `restricted` node MUST omit those **four** attributes and every `digest` over a gated target, and MUST still carry `agsc-spec-version` and `agsc-generated-at`), AGSC-09-93 (a validator accepts the absences and reports their presence as `AGSC-E210`) | the document still discloses that the node exists and is current, which is what `restricted` means (AGSC-11-20: "this node exists; its content is gated"); a publisher who wants no disclosure publishes no discovery document and is not a node |
| T19 | **An unbounded artefact fetch after the discovery document** — a hostile peer serves a 50 GB `graph.nq` or a compression bomb behind `rel#graph`, `rel#ledger` or a surface target, and a client's walk never returns | D | AGSC-11-10(f) added at rc.5 (`federation.timeout_ms` per response, 1 MiB for a discovery document, `federation.max_bytes` for any other artefact, measured on the **decoded** stream, aborted with `AGSC-E907`), AGSC-11-01 (the bound table) | a peer that stays inside the bound and still wastes a client's budget; the walk caps of AGSC-11-10(a)–(d) bound the total |

## 2. Digests versus signatures — what 1.0 proves and what it does not

**What the discovery layer proves.** Every artefact link in `/.well-known/knowledge-linkset` carries an RFC 9530 `digest` (SHA-256) and the anchor carries `agsc-bundle-hash` and `agsc-ledger-head` (AGSC-06-08…10). A reader who fetched the discovery document over TLS from the node's origin can therefore verify that every artefact it fetches is the one the publisher described, byte for byte, and that the ledger it reads ends where the publisher said it ends. The **peer check** (AGSC-10-12) proves that two nodes declare each other and that each other's link set validates — mutual conformance, not shared content, and it accepts two local files so it can run offline.

**What it does not prove.** Digests bind artefacts to the discovery document; they do not bind the discovery document to an author. Origin authentication at 1.0 is TLS plus DNS — the same trust a browser extends to any site — and nothing more. A tombstone's successor (T15), a mirror, or a re-hosted copy carries no proof of who wrote it.

**Why 1.0 stops there.** The standard is static-only: there is no server to hold a key, rotate it or answer a challenge, and a signing key in a public repository is no key. Key distribution is exactly the problem the adjacent protocols solve with infrastructure this standard refuses to require.

**The precedent this design follows.** The Agent2Agent protocol makes signing *optional* on exactly the analogous document. Re-verified by hand on 2026-09-16 against `a2aproject/A2A` `docs/specification.md` at `main` (commit `f63dbb4`, 2026-08-28; the page banner names `1.0.0` as the latest released version; the repository's newest tag is `v1.0.1`, 2026-05-28, whose task-state values match AGSC-02-99), §8.4 "Agent Card Signing" reads:

> "Agent Cards **MAY** be digitally signed using JSON Web Signature (JWS) as defined in RFC 7515 to ensure authenticity and integrity."

and §8.4.1:

> "Before signing, the Agent Card content **MUST** be canonicalized using the JSON Canonicalization Scheme (JCS) as defined in RFC 8785."

with §8.4.3 adding that clients "**SHOULD** verify at least one signature before trusting an Agent Card". That is the shape this specification adopts for the only signed artefact it admits at 1.0 — the optional Agent Card of AGSC-06-34, JCS then JWS — and the shape a future MINOR profile would take for the discovery document itself: a detached JWS over the JCS form of the link set, carried as one more extension target attribute, verified against a key the publisher names by URL. No artefact changes shape when that profile arrives, because every artefact is already JCS-canonical (AGSC-04-04).

**The optional signature link (rc.6, 2026-09-23).** A publisher who wants readers to check authorship without trusting the origin alone can now point at a detached signature over the discovery document, with the link relation `https://w3id.org/agentic-system-core/rel#signature` (AGSC-06-08, AGSC-06-10). In plain words: the digests say "these are the bytes the publisher hashed"; they say nothing about who the publisher is. At 1.x the answer to "who" is still the site's TLS certificate and DNS name. The signature link is a place to put more, not a promise: no rule fixes the signature format yet, no Level requires the link, it changes no digest, no claim and no walk, and a reader that does not understand it ignores it. It uses this specification's own relation name because the IANA link-relation registry, read on 2026-09-23, has no relation meaning "a detached signature over this document".

## 3. The ledger's bounds, stated honestly

The ledger (`ledger.jsonl`, AGSC-08-20…23) is a hash chain: each entry carries `hash = SHA-256(prev ‖ JCS(entry ∖ hash))`, and the discovery document pins the head. Against a **published** ledger an attacker who wants to alter an interior entry without changing the head faces a second-preimage problem, ~2²⁵⁶ work. An **author** who crafts two histories in advance so that both hash to one head faces a collision problem, ~2¹²⁸ work. Trailing truncation is detected only through `agsc-ledger-head`, which is why that attribute is mandatory. The ledger is *derived* from git history (AGSC-08-20a), never appended by hand, so it is reproducible and cannot be silently rewritten without the git history changing.

## 4. Reproducibility inputs

A build is a function of **four** inputs and nothing else (AGSC-04-01, 04-09, 04-18): the content tree, `agsc.config.json`, the build instant (`SOURCE_DATE_EPOCH`, defaulting to the last commit time, defaulting to `0` where no history exists), and — for the `agsc-ledger-head` attribute alone — the git-log file the ledger is derived from. A double build compares outputs (AGSC-04-02); the cross-implementation claim covers the machine artefacts and not HTML (AGSC-04-24).

## 5. What remains open at 1.0, by name

- **Authorship** — needs signatures; designed for as a MINOR profile (§2), not carried.
- **Truth** — nothing in the format asserts that an item is correct; `verified[]`, `sources[]` and `prov` record who checked what and when.
- **A verified but malicious contributor** — review, not format.
- **Restricted visibility** — the hook exists (AGSC-11-20); credential formats and encrypted-at-rest Bundles are reserved (`agsc-profile-encrypted`).
- **A responder's runtime** — declared, never served, at 1.0 (AGSC-11-21).
- **`prov.operator` is a published identifier of a natural person** (added at rc.5). It is emitted as `asc:operator` on every item by AGSC-05-26, travels into `graph.ttl`, `graph.nq`, `graph.jsonld` and `pages/*.jsonld`, and is exempt from the `no-pii` lint by AGSC-08-16 — by design (accountability is always a person, AGSC-02-07). `AGSC-02-90(2)` derives the default from the local part of `git user.email`. A publisher who needs pseudonymity sets `bundle.operator` to a role identifier (`human:editorial`) **before** `init`, which AGSC-02-90(1) then uses for every adopted item. The format defines no way to remove the identifier after publication other than a new item under AGSC-01-12 (a slug is permanent). Publishers in a data-protection regime should treat this as a processing of personal data and record it as such; `docs/COMPLIANCE-CROSSWALK.md` carries the same note.
