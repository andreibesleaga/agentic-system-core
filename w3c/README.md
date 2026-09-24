# `w3c/` — the W3C-facing specification source

**Status: SKELETON, to be published INDIVIDUALLY in W3C format (decided 2026-09-04).** `index.html` uses ReSpec `specStatus: "unofficial"` — the standard W3C document format for personal drafts, explicitly not a W3C publication — hosted from this repository (GitHub Pages / agenticsystemcore.com) with persistent identifiers from w3id.org. No W3C Community Group is needed for that; the CG route is parked and can be enabled later by switching `specStatus` to `"CG-DRAFT"` and adding `group`.
Created 2026-09-04.

## What this is

The source of the W3C-facing document for this project: the `asc:` vocabulary
(`../ontology/agsc.ttl` — 12 classes, 40 properties (52 terms; counts derived by `tools/count-artifacts`), OWL 2 RL, CC0), its JSON-LD context, the
namespace and versioning policy at `https://w3id.org/agentic-system-core/ns#`, and a human-readable
explanation of the profile identifier `https://w3id.org/agentic-system-core/profile/agentic-knowledge`.

It is deliberately **not** the discovery specification. The `/.well-known/knowledge-linkset`
resource (D60; the well-known URI — the discovery link itself is the registered relation `describedby`, D82 — the profile is named `agentic-knowledge`, which is
unchanged), its link relation type and its link-set profile are defined normatively by the
Internet-Draft in `../internet-draft/`, and this document cites it rather than restating it.

| File | What it is |
|---|---|
| `index.html` | ReSpec source for the report *Agentic Knowledge Vocabulary and Discovery Profile*, `specStatus: "unofficial"` (CG-DRAFT parked). Vocabulary tables kept in step with `../ontology/agsc.ttl` (one `<dfn>` per term; the term count is checked against the ontology by `tools/count-artifacts`); every unwritten section is marked `TODO`. Also contains the section describing how Turtle, JSON-LD and RDF/XML are served (namespace, `owl:versionIRI`, content negotiation). |

The track plan (Track W: goal, work packages, dates, gates), the publication checklist and the
sourced W3C publication-landscape research of 2026-09-04 that every claim above rests on are kept in
the project's **private planning record** and are not part of this repository; the public outcome of
that research is summarised in `../docs/RELATED-WORK.md`.

## Build and preview

No build tooling lives here and none is wanted.

```bash
# Live preview (renders client-side; needs network access to www.w3.org)
python3 -m http.server 8000 --directory .    # then open http://localhost:8000/

# Static export — this is what gets published. Default 10 s timeout is too short;
# the first run downloads ~100 MB (Chromium, via puppeteer).
npx respec --src index.html --out build/index.html -t 60
grep -c 'respec-w3c' build/index.html        # must print 0
```

Until the Community Group exists, `respecConfig.group` has no valid value. ReSpec does **not** stop
on an unknown group: it logs a 404 and falls back to `base` status, emitting the misleading Status
paragraph *"This document is merely a W3C-internal document…"* and a plain W3C copyright. Never
publish that output. To preview beforehand, temporarily set `specStatus: "unofficial"` and delete
the `group` line — do not commit that state.

## Hosting constraint — read before copying this page anywhere

`index.html` loads `https://www.w3.org/Tools/respec/respec-w3c`, and at render time also contacts
`respec.org` and `api.specref.org`. The static export removes those runtime fetches but still
references `www.w3.org` for the TR stylesheets and `scripts/TR/2021/fixup.js`.

`AGSC-06-05` forbids a published page to reference a third-party origin, and the site's
`Content-Security-Policy` is `default-src 'none'; script-src 'self'`. Therefore:

- this directory is **repository source**; it is not part of `build.out` and is never emitted into
  `www/`;
- the report is published on **GitHub Pages**, as the static export, not as this source;
- `agenticsystemcore.com` **links to** the report and does not mirror it.

## What is not here, on purpose

No `package.json`, no build script, no CI job. One documented `npx respec` command is the whole
toolchain. No normative text is invented for W3C space: everything normative already lives in
`../spec/`, `../schema/`, `../ontology/` and the Internet-Draft. Nothing here claims that any W3C
group has adopted, reviewed or endorsed anything — none has, and a Community Group Report is not a
W3C standard and is not on the W3C Standards Track.
