# SUBMISSION-NOTES -- `draft-besleaga-agentic-knowledge-wellknown-00`

Written 2026-09-18 alongside the draft. Nothing here has been sent. The
owner sends every message from their own accounts (D57 Q15); the assistant
never submits, posts or e-mails anything.

Read with `../internet-draft/README.md` (what the draft registers, the
rights boundary) and the filing runbook's Filing C (Datatracker + ISE) and
Filing D (the well-known URI registry issue).

---

## 1. Build state

`./build.sh 00` was run with the script exactly as found; the `.xml`,
`.txt` and `.html` beside the draft are that run's outputs. Full summary:

```
==> building draft-besleaga-agentic-knowledge-wellknown-00
    OK   front-matter docname matches draft-besleaga-agentic-knowledge-wellknown-00
    OK   draft-besleaga-agentic-knowledge-wellknown-00.md is pure ASCII
** (normative reference RFC2119 is both inline and in YAML header)
** (normative reference RFC8174 is both inline and in YAML header)
*** warning: explicit settings completely override canned bibxml in reference I-D.jimenez-dawn-discovery-landscape
    wrote draft-besleaga-agentic-knowledge-wellknown-00.xml (clean RFCXML v3 vocabulary)
    wrote draft-besleaga-agentic-knowledge-wellknown-00.txt, draft-besleaga-agentic-knowledge-wellknown-00.html
==> checks
    OK   no lines over 72 characters
    OK   draft-besleaga-agentic-knowledge-wellknown-00.txt is pure ASCII
==> idnits v3 (normal mode)
    FAIL: idnits v3 reports 2 nit(s) on draft-besleaga-agentic-knowledge-wellknown-00.xml
         [1] Warning | INVALID_DOMAIN_TLD | Domain "w3id.org" is not an allowed reserved domain. Consider using ".example.(com|org|net)" instead.
         [2] Warning | INVALID_DOMAIN_TLD | Domain "w3id.org" is not an allowed reserved domain. Consider using ".example.(com|org|net)" instead.
    FAIL: idnits v3 reports 5 nit(s) on draft-besleaga-agentic-knowledge-wellknown-00.txt
         [1] Error | MULTIPLE_REFERENCES_SECTION_TITLES | Multiple occurrences of the References section title detected. There should only be one top-level References section.
         [2] Warning | INVALID_DOMAIN_TLD | Domain "w3id.org" is not an allowed reserved domain. Consider using ".example.(com|org|net)" instead.
         [3] Warning | PREFER_BCP14_REF | Consider referencing BCP14 instead of (or in addition to) RFC2119/RFC8174, as BCP14 encompasses both specifications.
         [4] Warning | SECTION_TITLE_HAS_UNEXPECTED_INDENTATION | Document has unexpected indentation in Appendix.
         [5] Warning | SECTION_TITLE_HAS_UNEXPECTED_INDENTATION | Document has unexpected indentation in Appendix.

==> draft-besleaga-agentic-knowledge-wellknown-00 FAILED one or more checks (see FAIL lines above)
```

**In submission mode -- the mode the Datatracker runs on upload -- both
files are clean:**

```
idnits -m submission draft-...-00.xml   {'error': 0, 'warning': 0, 'comment': 0}
idnits -m submission draft-...-00.txt   {'error': 0, 'warning': 0, 'comment': 0}
```

Every normal-mode nit above was traced. None is a defect in the draft
text, and three of them are also raised, in the same mode, on the author's
already-posted `draft-besleaga-sustainability-wellknown-07.txt`
(measured 2026-09-18: 1 error, 4 warnings -- MULTIPLE_REFERENCES_SECTION_TITLES,
PREFER_BCP14_REF and three SECTION_TITLE_HAS_UNEXPECTED_INDENTATION).

1. **MULTIPLE_REFERENCES_SECTION_TITLES (Error, .txt).** Caused by
   `build.sh`'s own post-processing step, not by the draft. The step
   removes the combined `<references anchor="sec-combined-references">`
   wrapper unconditionally, which leaves two top-level References sections
   ("13. Normative References", "14. Informative References") instead of
   "13. References" with "13.1"/"13.2" under it. **Tested fix:** collapse
   that wrapper only when it contains fewer than two nested `<references>`
   elements, and change the guard below it to match. Rendered with the
   wrapper kept, the .txt shows `13. References` / `13.1. Normative
   References` / `13.2. Informative References` and the error disappears
   with no new nit. The build script was left untouched -- the owner should
   apply this one-line change, since it affects every draft built with it.
2. **INVALID_DOMAIN_TLD "w3id.org" (Warning, .xml x2 and .txt x1).** The
   profile URI and the extension relation URIs are real persistent
   identifiers, and the registration requests name them. They cannot be
   `.example`. Unfixable and correct as it stands.
3. **PREFER_BCP14_REF (Warning, .txt).** kramdown-rfc 1.7.43 builds a
   `BCP14` reference through `https://bib.ietf.org/public/rfc/
   bibxml-rfcsubseries-new/reference.BCP.0014.xml`, which returns 404
   (checked 2026-09-18; the live path is `.../bibxml9/reference.BCP.0014.xml`,
   200). Using `{::boilerplate bcp14-tagged-bcp14}` therefore produces an
   unresolvable `<xref target="BCP14"/>` and xml2rfc refuses the document.
   The draft cites RFC 2119 and RFC 8174 directly, exactly as the
   sustainability drafts do.
4. **SECTION_TITLE_HAS_UNEXPECTED_INDENTATION (Warning, .txt x2).** Raised
   on table-of-contents lines 119 and 120, which are `Appendix A.  A
   Complete Example` and `Appendix B.  Change Log` as xml2rfc renders them.
   An idnits v3 plaintext false positive; the same check fires three times
   on the posted sustainability draft.

The two `**` lines from kramdown-rfc about RFC2119/RFC8174 are the
expected consequence of `{::boilerplate bcp14-tagged}` and appear on the
sustainability drafts too. The `***` line is intended: the
`I-D.jimenez-dawn-discovery-landscape` reference is written out by hand so
that the draft stays pure ASCII (see item 5 of section 4 below).

Rebuild on the day of posting (kramdown-rfc stamps the build date; there is
no `date:` line in the front matter), and do not rebuild after posting.

---

## 2. ISE submission e-mail -- ready to send

Send after the `-00` is posted and the I-D Action announcement has arrived.
Replace `<date>` and `<n>` before sending; send nothing while a bracket
remains.

**To:** rfc-ise@rfc-editor.org
**Subject:** Independent Submission: draft-besleaga-agentic-knowledge-wellknown-00

```text
Dear Independent Submissions Editor,

I would like to submit the following document for consideration on the
Independent Stream. The seven items of the ISE checklist are below.

1. File name

   draft-besleaga-agentic-knowledge-wellknown-00

   https://datatracker.ietf.org/doc/draft-besleaga-agentic-knowledge-wellknown/

2. Desired category

   Informational.

3. Prior discussion

   The document has not been discussed in an IETF working group and has
   not been submitted to the IESG. Its Section 8, "Relationship to Other
   Work", records what neighbouring work addresses: RFC 9727
   (api-catalog), llms.txt, draft-arsentev-llm-context-discovery,
   draft-serra-mcp-discovery-uri, the Model Context Protocol and
   Agent2Agent specifications, the proposed dawn working group and its
   landscape survey, the agentproto BOF request, the aipref and
   webbotauth working groups, the Open Knowledge Format, and W3C VoID
   and DCAT. An informational note about the document was sent to
   dawn@ietf.org on <date> (<thread link>), and a pre-check issue for
   the well-known URI suffix was opened at the registry's GitHub
   interface on <date> (<issue link>).

4. IANA assertion

   No IANA allocation in this document requires IETF Review or Standards
   Action. The document requests one Well-Known URI suffix,
   "knowledge-linkset" (RFC 8615, Specification Required; requested with
   provisional status), and it specifies one Profile URI,
   https://w3id.org/agentic-system-core/profile/agentic-knowledge, whose
   entry in the RFC 7284 "Profile URIs" registry (First Come First
   Served) was filed on <date> as <n>. The document creates no registry,
   and requests no media type, no URI scheme and no link relation type:
   the discovery link from a page uses the existing "describedby"
   relation with type="application/linkset+json".

5. Purpose, audience, merits, significance

   The document defines one well-known URI at which a web origin
   publishes an RFC 9264 link set describing the knowledge artefacts it
   makes available -- graph serializations, a JSON-LD context, a
   vocabulary, an agent-facing text file, a chunk export, a change
   ledger -- with an optional RFC 9530 SHA-256 digest on each, and a
   profile URI that names the conventions the link set follows. Its
   audience is site operators who publish machine-readable knowledge,
   and the crawler, agent-runtime and validator implementers who read
   it. Its merit is that it reuses RFC 8615, RFC 8288, RFC 9264,
   RFC 9530, RFC 9651 and RFC 6906 without adding a media type, a
   registry or a scheme, so a generic link set client can read the
   document without knowing this specification. Its significance is that
   the agent-discovery mechanisms surveyed in
   draft-jimenez-dawn-discovery-landscape discover actors and endpoints;
   this document discovers a described, integrity-checked set of
   documents, which to the author's knowledge none of them does. A running implementation, a
   validator and a set of conformance vectors are recorded in the
   RFC 7942 section.

6. IPR acknowledgement

   The author acknowledges that the IPR rules of RFCs 4846 and 5744
   apply, and permission is granted to produce derivative works.

7. Suggested reviewers

   <see the candidates in section 3 of these notes; name only those you
   have contacted and who have agreed>

The document builds with kramdown-rfc and xml2rfc and is reported free of
errors, warnings and comments by idnits v3 in submission mode.

Thank you for considering it.

Andrei Nicolae Besleaga
Independent
andrei.besleaga.nicolae@gmail.com
ORCID 0009-0001-3464-5283
```

---

## 3. Independent reviewer candidates

Three candidates, one per role the runbook names. **The owner decides
whether to name anyone, and contacts them first**; the runbook's rule
stands -- never propose someone without checking their current affiliation
and address.

### 3.1 An RFC 9264 / RFC 9727 author

**Kevin Smith** -- sole author of RFC 9727 (`api-catalog`), the design
precedent this draft follows, and a co-editor of the POWDER Description
Resources Recommendation, which registered the `describedby` relation the
draft relies on. Two qualifications in one person.

* RFC 9727 Authors' Addresses: "Kevin Smith, Vodafone,
  kevin.smith@vodafone.com, https://www.vodafone.com" --
  https://www.rfc-editor.org/rfc/rfc9727.html (checked 2026-09-18).
* POWDER-DR editor list: "Kevin Smith, Vodafone Group R & D" --
  https://www.w3.org/TR/2009/REC-powder-dr-20090901/ (checked 2026-09-18).
* **Affiliation unverified**: no Vodafone organisation page listing him
  was found; the only sources are the two specification records above,
  the newer of which is RFC 9727 (June 2025).

Alternates for the same role, both RFC 9264 (Linkset) authors, from that
RFC's Authors' Addresses (https://www.rfc-editor.org/rfc/rfc9264.txt,
checked 2026-09-18): **Erik Wilde** (Axway, erik.wilde@dret.net --
**affiliation unverified**; his own site dret.net did not serve a valid
certificate when checked on 2026-09-18) and **Herbert Van de Sompel**
(Data Archiving and Networked Services,
herbert.van.de.sompel@dans.knaw.nl, ORCID 0000-0002-0715-6126 --
**affiliation unverified**; a search of dans.knaw.nl on 2026-09-18
returned no staff entry).

### 3.2 A W3C JSON-LD or DCAT editor

**Andrea Perego** -- an editor of the Data Catalog Vocabulary (DCAT)
Version 3, and also a co-editor of POWDER-DR. DCAT is the vocabulary a
publisher would use alongside this mechanism, and the draft's Section 8
names it.

* DCAT 3 editor list: "Andrea Perego, Invited Expert" --
  https://www.w3.org/TR/vocab-dcat-3/ (checked 2026-09-18). The
  Recommendation gives him no employer.
* POWDER-DR editor list: "Andrea Perego, Universita degli Studi
  dell'Insubria" (2009) --
  https://www.w3.org/TR/2009/REC-powder-dr-20090901/ (checked 2026-09-18).
* **Affiliation unverified**: the current Recommendation lists him as an
  Invited Expert with no organisation, and no organisation page was
  checked.

Alternate for the same role: **Riccardo Albertoni**, DCAT 3 editor,
listed as "Invited Expert, CNR - Consiglio Nazionale delle Ricerche,
Italy" on https://www.w3.org/TR/vocab-dcat-3/ (checked 2026-09-18);
**affiliation unverified** against a CNR staff page.

### 3.3 An llms.txt or ARD maintainer

**Jeremy Howard** -- author of the llms.txt convention, which the draft's
Section 8 records and whose `describedby` discovery link this draft shares.

* llms.txt v2, authored by Jeremy Howard, page modified 2026-08-10 --
  https://llmstxt.org/ (checked 2026-09-18).
* **Affiliation verified on the organisation's own site**: Answer.AI's
  launch post names him "Jeremy Howard (founding CEO, previously
  co-founder of Kaggle and fast.ai)" --
  https://www.answer.ai/posts/2023-12-12-launch.html (checked
  2026-09-18). Note that this is the company's launch post, dated
  2023-12-12; https://www.answer.ai/ still carries him as its founder
  (checked 2026-09-18), but no dated staff page was found, so the
  currency of the role rests on the company's own site rather than on a
  personnel listing.

No public e-mail address was collected for any of the three. The owner
looks one up at the point of writing, or asks through the relevant list.

---

## 4. Every TODO left in the draft

Exactly one.

1. `TODO-DOI` -- line 145 of
   `draft-besleaga-agentic-knowledge-wellknown-00.md`, inside the `ann:`
   of the `[AGSC-SPEC]` reference:

   ```
   ann: "TODO-DOI: insert the Zenodo DOI of the cited release here before posting."
   ```

   Replace it with the Zenodo DOI of the cited specification release, or
   delete the `ann:` line if no DOI is minted before posting. The DOI
   appears nowhere else in the draft.

`grep -n TODO draft-besleaga-agentic-knowledge-wellknown-00.md` returns
that one line and nothing else.

---

## 5. Reference versions confirmed live on the Datatracker, 2026-09-18

| Reference | Version and date seen | State seen |
|---|---|---|
| `draft-jimenez-dawn-discovery-landscape` | **-00**, 3 July 2026, "A Survey of AI Agent Discovery Mechanisms" (Jimenez, Feng, Arkko, Kuehlewind, Kandoi) | Active individual submission |
| `draft-arsentev-llm-context-discovery` | **-00**, 11 September 2026, "Discovery and Retrieval of Publisher-Curated Context Files for Large Language Model Consumers" (Arsentev, Independent) | Active individual submission |
| `draft-serra-mcp-discovery-uri` | **-04**, 25 March 2026, "The 'mcp' URI Scheme and MCP Server Discovery Mechanism" (Serra, Mumble Group) | Active individual submission |
| `draft-ietf-aipref-vocab` | **-08**, 14 September 2026, "A Vocabulary For Expressing AI Usage Preferences" (Keller, Thomson) | Active, aipref WG |
| `draft-ietf-aipref-attach` | **-05**, 19 August 2026, "Associating AI Usage Preferences with Content in HTTP" (Illyes, Thomson) | Active, aipref WG, intended Proposed Standard |
| `draft-ietf-webbotauth-httpsig-protocol` | **-00**, 1 September 2026, "HTTP Message Signatures for automated traffic" (Meunier, Major) | Active, webbotauth WG |
| `charter-ietf-dawn` | charter revision **11 September 2026**, "Discovery of Agents With Names" | Proposed; Internal Review, 2 blocking positions |
| `bofreq-steele-agentproto` | revision **4 September 2026**, "AgentProto" | Proposed |

Other non-RFC references, checked the same day: llms.txt v2, page modified
2026-08-10 (https://llmstxt.org/); POWDER-DR, W3C Recommendation
1 September 2009, `describedby` defined in Section 4.1.4 and Appendix D;
DCAT 3, W3C Recommendation 22 August 2024.

All `I-D.*` references except `I-D.jimenez-dawn-discovery-landscape` are
resolved automatically by kramdown-rfc and therefore track the newest
revision at build time; re-check this table on the day of posting and note
any revision that has moved. `I-D.jimenez-dawn-discovery-landscape` is
written out by hand, pinned to `-00`, because the bibxml record for it
carries the co-author name "Kuehlewind" with a U+00FC and the draft would
otherwise not be pure ASCII; if the owner prefers the diacritic, restore
the automatic `I-D.` form and relax the build's ASCII gate for
`<reference>` author names.

---

## 6. Open points for the owner

1. Post only when the node serves `/.well-known/knowledge-linkset` with
   `200 application/linkset+json` and the profile (media-type parameter or
   `Link` header), and when `/specs/agentic-knowledge/` resolves: the
   RFC 7942 section and the profile URI registration both point at them.
2. The RFC 7942 section says the node serves the reduced form (Level 0).
   If the node serves the full form on the day of posting, change that one
   bullet before building.
3. `build.sh`: apply the one-line references-wrapper fix of section 1
   item 1 before the next build, or accept the MULTIPLE_REFERENCES error
   in normal mode.
4. Decide whether to name any of the three reviewers in item 7 of the ISE
   e-mail, and contact them first.
