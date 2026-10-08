# Evolving Sankofa into the AIMS Scholarly Repository

Assessment date: 2026-10-02. Basis: AIMS Scholarly Repository Architecture and Implementation Roadmap, version 1.0, 2026-09-30, plus the current Sankofa source. This is an implementation assessment, not approval of a changed institutional architecture.

## Immediate publication correction

GitHub Pages had published the root README through its branch-based publisher. The Vite source entry existed at `frontend/index.html`, but the root had no compiled entry or assets. The fix publishes the production bundle as root `index.html`, `assets/` and `.nojekyll`. `npm run pages:publish` reproduces it. Hash routes support refresh and direct links on Pages. The public frontend still needs a separately hosted API for real records, questions and graph streams.

## What the roadmap changes

The target is a network scholarly repository, covering theses, articles, presentations, datasets, code and reports. Sankofa currently provides a thesis discovery interface, PDF ingestion into a knowledge graph and vector index, and exploratory AI features. Those are useful extensions, but do not yet supply the governed repository of record described in the roadmap.

The roadmap evaluated DSpace as one possible repository platform. AIMS has chosen the fully custom Sankofa repository for this implementation: React, FastAPI, a Sankofa-owned catalogue, durable bitstream storage, Neo4j and Qdrant. The deviation and operating boundary are documented in `docs/repository-operations.md`; DSpace is not a runtime or account dependency.

## Capability assessment

| Requirement | Current evidence | Necessary evolution |
|---|---|---|
| Public portal | React archive, detail views, citation exports, AI and graph views | Publish real records through a hosted API; prioritise repository browse and access over AI navigation |
| Communities and collections | Campus field and concept relations | Stable community and collection IDs; Centre and programme hierarchy; one owning collection and explicit mappings |
| Multiple work types | Thesis endpoints and PDF-only upload | Item model supporting articles, datasets, code, conference work and reports; validated type vocabularies |
| Descriptive metadata | Title, year, campus, abstract and linked author | Structured authors and supervisors, issue dates, language, programme, identifiers, access and licences; Dublin Core crosswalk |
| Browse and search | Hybrid search, campus/year/concept filters; capped client hydration | Server pagination; alphabetical author/title browse; date browse and scoped facets; searchable full text |
| Preservation | A local path stored on ingestion | Durable bitstreams, checksums, storage versioning, backups and verified restores |
| Deposit and editorial review | Upload ingests immediately | Authenticated draft, submission, librarian review, editor approval and publication with audit events |
| Permissions and embargo | No public PDF endpoint or enforced release workflow observed | Server-enforced file access, consent and licence evidence, embargo expiry and request-a-copy |
| Citation and identifiers | BibTeX and RIS in UI | APA suggestion and CSV export; persistent item identifiers; approved DOI registration integration |
| Usage reporting | Missing metadata shown explicitly | Define events, bot filtering and repeat-window rules; aggregated views/downloads; MELA CSV export |
| Interoperability | App-specific REST and graph socket | OAI-PMH, scholarly metadata tags, ORCID/ROR mappings, identifier linking and export contracts |
| Inclusion | Responsive, keyboard-accessible English UI | English/French coverage; accessible files; low-bandwidth mode; independent accessibility audit |
| Operations | Development compose and frontend CI | Staging/production separation, monitored HTTPS services, restore runbook and named operators |

## Critical ingestion finding

`src/sankofa/api/rest/theses.py` uploads a PDF into a temporary file, calls `ingest`, then unlinks that file in `finally`. The ingestion pipeline records that same temporary path in the graph. The resulting metadata does not establish that the PDF has been preserved or can be downloaded. In addition, `_thesis_id` hashes the file path rather than file content: another upload of identical bytes under another temporary path can generate another ID. Resolve preservation and identity before migrating any authoritative collection. Do not expose the current upload endpoint publicly as a production deposit service without authentication, quotas, content checks and workflow enforcement.

A durable implementation should allocate a stable item UUID, store an immutable bitstream with a SHA-256 checksum before publication, keep checksum-based duplicate detection separate from item identity, and clean temporary files only after successful durable storage. Failed transactions need recovery and audit evidence. Graph and vector records should be rebuildable derivatives of the repository metadata and published files.

## Decisions to resolve in the governing document

1. Clarify the Centre list. The document requires six Centres but names five examples and leaves the remainder unconfirmed. Treat AIMS RIC as an explicitly approved organisational unit for the pilot rather than silently adding or merging it.
2. Validate the custom repository against the roadmap's acceptance evidence: durable storage, restore, metadata, workflow, access control, harvesting, statistics and AI withdrawal propagation.
3. Resolve joint ownership and acceptance versus reporting that consults the Librarian only occasionally. Metadata, access rules, reporting and migration acceptance require continuous library participation.
4. Permit honestly absent legacy metadata. A translated title, bilingual abstract or supervisor ORCID cannot be invented to satisfy a required-field rule. Distinguish mandatory deposit fields from legacy completeness targets and record exceptions.
5. Define whether a Handle, DOI, or both are required per work type. DOI registration requires a provider agreement, credentials, funding and policies; assigning an internal ID is not minting a DOI.
6. Distinguish deposit authority from permission to publish. Mandatory deposit does not automatically settle copyright, sensitive datasets or publisher restrictions.
7. Define how anonymised usage will support country reporting and whether city reporting is justified. Set suppression thresholds and retention rules before collecting geography. Keep alumni attributes in a separately authorised MELA service.
8. Turn broad acceptance requirements into measurable checks. Record search relevance criteria, performance budgets under a stated bandwidth profile, backup recovery objectives, accessibility method and independent reviewer.
9. Separate repository availability from external indexing outcomes. Harvestable metadata can be tested directly; Google Scholar, CORE and directory registration require external validation and are not guaranteed by tags alone.

## Delivery sequence with acceptance gates

| Order | Deliverable | Gate |
|---|---|---|
| 1 | Publish the compiled UI and connect a staging repository API | Live routes, reloads and assets verified; one real authorised item can be read |
| 2 | Freeze system of record, item schema, Centre taxonomy and rights policy | Owners approve decisions; field crosswalk and legacy exceptions documented |
| 3 | Durable storage, stable IDs and authenticated editorial deposits | Upload survives restart; checksum verified; duplicate detection; drafts never leak publicly |
| 4 | Repository browsing and item access | Scoped browse with server pagination; real file access; embargo enforcement |
| 5 | Identifiers, harvesting and reporting | OAI-PMH validation; identifier resolution; bot-filtered metrics; privacy-approved export |
| 6 | AIMS RIC pilot migration | Manifest reconciled; over 95% defined metadata completeness; all bitstream checksums verified |
| 7 | Network rollout and handover | English/French and accessibility review; restore drill; trained operators; owners accept |
| 8 | Evidence-grounded AI discovery | Retrieval references published sources; access rules inherited; reproducible evaluation; opt-out available |

These are dependency gates, not a substitute for the roadmap's staffing, procurement, 52-week contract, legal review or owner sign-off. The UI publication is not the institutional launch.

## Traceability to roadmap acceptance tests

| Test | Status in current Sankofa | Evidence required |
|---|---|---|
| T1 issue date | Partial year sorting | Complete date browse, jump navigation, ascending/descending order |
| T2 authors | Missing author browse | Surname A–Z, prefix jump and author-scoped records |
| T3 titles | Partial title sorting | A–Z jump and pagination across all records |
| T4 AMMI scope | Missing community model | Scoped browse excludes all other community items |
| T5 multi-community mapping | Missing | One item/bitstream appears in both collections without duplication |
| T6 PDF downloads | Missing public download service | Permitted download succeeds and counted human event appears |
| T7 human views and crawler filtering | Not implemented | Human view counted, recognised crawler excluded, repeats deduplicated |
| T8 statistics | Not implemented | Defined trends, top records and privacy-approved geography verified |
| T9 embargo | Not implemented | Metadata visible; file denied; request workflow and expiry tested |
| T10 editorial submission | Immediate ingestion only | Submit, review, return, approve, publish and notification verified |
| T11 harvesting and tags | Not implemented | OAI-PMH response validated; public item HTML contains accurate tags |
| T12 EN/FR | English only | Key journeys complete in both languages, including metadata fallbacks |
| T13 restore | Not demonstrated | Restore metadata and files to staging and verify checksums |
| T14 accessibility | Keyboard behavior tested; conformance unproven | Automated and manual WCAG audit, including PDFs and assistive technology |

No T1–T14 institutional acceptance test is claimed passed solely because frontend fixture tests pass. Confirm statuses again against the chosen repository platform and a populated staging installation.
