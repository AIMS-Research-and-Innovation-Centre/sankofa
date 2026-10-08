# Sankofa and DSpace

Sankofa is the AIMS-branded website, search, AI layer and administration interface. DSpace is the repository system of record. Sankofa never writes to PostgreSQL, Solr or the DSpace assetstore directly; it uses DSpace's documented REST API.

## Supported service

The integration targets DSpace 10.1 and the matching DSpace Angular 10.1 release. Keep the backend and UI on the same DSpace release line. The REST base URL must include the DSpace server context, normally `https://repository.aims.ac.za/server`, not only the hostname.

Configure:

```dotenv
LA_DSPACE_URL=https://repository.aims.ac.za/server
LA_SESSION_SECRET=<long-random-secret>
LA_SESSION_COOKIE_SECURE=true
LA_DSPACE_LIBRARIAN_GROUP=AIMS Librarians
LA_DSPACE_EDITOR_GROUP=AIMS Network Editors
```

The DSpace account signs in once through Sankofa. The signed, HttpOnly Sankofa cookie contains the DSpace bearer token; passwords are never stored by Sankofa. Librarians and network editors are authorised by their DSpace groups. The DSpace REST client obtains and forwards the required CSRF token for every modifying request.

## Repository journeys

- Communities and collections are read from DSpace and shown through Sankofa's branded navigation.
- A signed-in user selects a collection, enters metadata and uploads a file. DSpace stores the bitstream durably, records checksums and applies its configured licence/access/embargo rules.
- Submission creates a DSpace workspace item, updates its submission metadata, uploads the file, and submits it to the collection's configured workflow.
- Librarians and editors see DSpace workflow items in Sankofa Administration. Their actions are delegated to DSpace, so the institutional review/audit trail remains in DSpace.
- Public item metadata and bitstream links are read from DSpace. DSpace remains responsible for download permission, embargoes, withdrawals, identifiers and repository statistics.
- OAI-PMH, harvesting, DOI/Handle configuration, usage statistics, bot filtering and integrations such as ORCID/ROR/OpenAIRE are configured and operated in DSpace. Sankofa does not create a second repository catalogue.

## AI indexing and corrections

An item is indexed only when it is archived, open, not withdrawn, and has the librarian-controlled metadata flag `aims.ai.index=true`. The synchronisation command downloads the authorised PDF from DSpace and upserts one stable derivative ID into Neo4j and Qdrant. Re-syncing replaces concepts and vectors, so metadata corrections propagate. If the item becomes withdrawn, restricted, embargoed or loses the flag, the derivative is removed and an access-change event is recorded.

Do not bulk-index a DSpace instance until the AIMS librarian has approved the metadata registry and the `aims.ai.index` policy.

## Deployment

For a configured DSpace service, one command builds and starts the Sankofa website, API, Neo4j and Qdrant:

```bash
cp .env.example .env
# edit .env: set LA_DSPACE_URL and a random LA_SESSION_SECRET
docker compose -f deploy/compose.yml up -d --build
```

The bundled compose file is an operational packaging baseline for Sankofa and local derivative services. DSpace itself must be deployed by AIMS from the official DSpace release, with PostgreSQL, Solr and its assetstore/object storage. The upstream DSpace development Docker images are not a production-readiness claim; AIMS must build, secure, patch and monitor its own DSpace images and storage.

Open `http://localhost:8088` locally. Put the web service behind AIMS HTTPS and a real domain in an institutional deployment.

## Backup, restore and migration

Back up all four authoritative/derived layers independently: DSpace PostgreSQL, DSpace assetstore/object storage, DSpace configuration and Solr indexes, plus Sankofa's `data/` event/audit files and the Neo4j/Qdrant volumes. Database and assetstore backups must be taken as a consistent DSpace backup according to the installed DSpace operations runbook.

Restore in a disposable environment first: restore PostgreSQL and the assetstore, restore DSpace configuration, rebuild/reindex Solr, start DSpace, then restore Sankofa's event files and rebuild AI derivatives only by re-running the authorised synchronisation. Validate login, one public item, one restricted/embargoed item, a withdrawal, a corrected metadata value, a download, OAI-PMH and usage statistics before promotion.

Migration tooling already accepts the roadmap CSV template through `sankofa metadata import`. For bulk migration into DSpace, use DSpace's supported batch import tooling and then run the authorised synchronisation; do not import directly into DSpace tables.

## Accessibility and languages

The Sankofa shell retains English/French interface support, keyboard navigation, visible focus, semantic labels and responsive layouts. DSpace's own language and accessibility settings must also be enabled and tested in the deployed Angular UI. Test the complete submission/review journey with keyboard-only navigation and a screen reader in both languages before launch.
