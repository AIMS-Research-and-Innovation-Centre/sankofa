# Sankofa

A thesis archive for the African Institute for Mathematical Sciences. Find, read, cite, and question theses, and follow connections across campuses and cohorts. The name comes from the Akan concept “Go back and fetch it.”

## Web interface

The interface follows the AIMS Scholarly Repository roadmap: one archive for the whole network, a community per Centre, and consistent scholarly browse labels.

- **Discover:** search across all Centres, filter by Centre, year and concept, and add results to the notebook.
- **Centres:** all six Centres in the controlled list (AIMS South Africa, Senegal, Ghana, Cameroon, Rwanda and the AIMS Research and Innovation Centre), each with its own page. Programme communities C2 to C5 are listed alongside them. Free-text campus values such as `ghana` or `Cape Town` are mapped onto the list (`src/sankofa/centres.py`, mirrored in `frontend/src/centres.ts`).
- **Browse:** by Centre, issue date, author, title and subject, scoped to the whole archive or to one Centre.
- **Knowledge graph:** theses, concepts, authors and Centres as typed nodes, each type with its own shape and colour. Search, filter by type or Centre, focus on a node's neighbourhood, and inspect its connections. A list view covers keyboard and screen-reader use.
- **Notebook:** choose theses as sources and ask questions. Answers draw only on the selected sources and cite them as [n]. When no language model is available, answers quote the relevant abstract sentences instead. Studio builds a source guide, shared concepts and an APA bibliography, and exports to Markdown.
- **Thesis pages:** metadata, an APA 7 suggested citation, BibTeX, RIS and CSV export, inline questions, and links to the graph and notebook.
- **Agents:** an MCP server, so Hermes Agent and other MCP clients can use the archive (see below).
- English and French interface, light and dark themes (following the system setting by default), responsive layouts and keyboard navigation.

## Run locally

Requires Python 3.12+, Docker Compose, and Node.js 22.12+ (or Node.js 20.19+).

```bash
git clone https://github.com/Naphymoro/sankofa.git
cd sankofa
cp .env.example .env
make bootstrap
make seed
make dev
```

The existing API runs on port **8001**. In a second terminal:

```bash
cd sankofa/frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. The development server proxies `/api` and `/ws` to the backend. Do not run `build_api.sh` or `fill_gaps.sh` to start the application: those are legacy source-generation scripts that overwrite existing files.

```bash
make ui-build                 # TypeScript check and production bundle
cd frontend
npx playwright install chromium
npm test                      # Browser tests with API/WebSocket fixtures
```

The browser suite verifies frontend behavior and request/response contracts using fixtures. It does not start Neo4j, Qdrant, an embedding model, or Ollama. `make smoke` is the existing backend integration check and requires those services.

## Routes and keyboard navigation

| Route | Purpose |
| --- | --- |
| `/` | Discover: search and filter the archive |
| `/centres`, `/centres/:slug` | The AIMS Centres and each Centre's community page |
| `/browse` | Browse by Centre, issue date, author, title or subject |
| `/graph` | Knowledge graph (`?focus=<thesis id>`, `?centre=<slug>`, `?concept=<name>`) |
| `/notebook` | Ask cited questions of chosen theses |
| `/connect` | Connect an agent over MCP |
| `/thesis/:id` | Read, ask questions, and cite |
| `/oracle`, `/dreams` | Exploratory research directions and graph passages |
| `/about` | Context, ethics, and keyboard guide |

| Key | Action |
| --- | --- |
| `/` | Focus search; open the archive if this view has no search |
| `j` / `k` | Next / previous archive result |
| `Enter` | Open the focused thesis |
| `g h` / `g c` / `g b` | Go to Discover / Centres / Browse |
| `g g` / `g n` | Go to the knowledge graph / notebook |
| `Esc` | Clear the current search or graph selection |
| `Tab` | Navigate all controls and links |

Shortcuts do not interrupt text entry. Filter, query, and sort state are stored in the URL. Browser back/forward and direct thesis links work.

## Connect an agent (Hermes Agent and other MCP clients)

Sankofa serves the archive over the Model Context Protocol. Every tool is read-only: `search_theses`, `get_thesis`, `related_records`, `list_centres`, `ask_theses` and `propose_directions`.

```bash
pip install -e '.[agents]'   # adds the MCP SDK
sankofa mcp                  # stdio, for a local agent
```

With the extra installed, the API also serves streamable HTTP at `/mcp/`. For Hermes Agent, add this to `~/.hermes/config.yaml`, then run `/reload-mcp`:

```yaml
mcp_servers:
  sankofa:
    url: "https://<api-host>/mcp/"
```

The endpoint accepts `localhost` by default. To serve a public hostname, set `LA_MCP_ALLOWED_HOSTS='["archive.example.org"]'`. Set `LA_PUBLIC_URL` to the web interface's address so tool results link back to records.

## Metadata and DOIs

Each thesis carries the roadmap's metadata schema (Section 5): authors and supervisors with ORCID, English and French titles and abstracts, keywords and MSC 2020 codes, Centre, programme, language, licence, access and embargo, funders, and related articles, datasets and code. Sankofa maps it to the DataCite Metadata Schema 4 and registers DOIs through DataCite's REST API.

- **Curate:** each thesis page links to `/thesis/:id/curate`, which edits the record, shows what is missing, and previews the exact DataCite record. `/curation` tracks completeness across the archive against the roadmap's 95% target.
- **DOI workflow:** *reserve* creates a draft DOI. Drafts can be edited or discarded and do not resolve. *Register* makes the DOI findable, which is permanent and needs explicit confirmation. A DOI can be reserved only when every required field is complete. After that, saved edits are sent to DataCite automatically.
- **Bulk import:** `sankofa metadata import file.csv [--dry-run]` reads the roadmap's template (see [`docs/metadata-template.csv`](docs/metadata-template.csv); multiple values are joined with `||`). Bad rows are reported and skipped. `sankofa metadata report` prints completeness, worst records first.
- **Command line:** `sankofa doi reserve <id>`, `sankofa doi register <id>` and `sankofa doi discard <id>`.
- **Configuration:** set `LA_CURATOR_TOKEN` to enable edits, and `LA_PUBLIC_URL` so each DOI points to its thesis page. Set the `LA_DATACITE_*` variables to AIMS's DataCite repository account and prefix. The default API is DataCite's **test** system, so production needs `LA_DATACITE_API_URL=https://api.datacite.org`. Metadata edits and DOI actions are recorded in the event log.

## Production hosting

### Self-contained repository deployment

Sankofa owns its repository catalogue, accounts, deposits, workflow, durable files and AI access policy. Users do not need DSpace accounts or any external repository account. See [`docs/repository-operations.md`](docs/repository-operations.md). With `.env` configured, the bundled stack starts with `make deploy` (or `docker compose -f deploy/compose.yml up -d --build`).

For GitHub Pages, see [deployment instructions](docs/github-pages.md). The Pages workflow publishes the UI with repository-relative assets and hash navigation. A separate backend is required for archive data and live features.

`npm run build` creates `frontend/dist`. Serve its files with SPA fallback to `index.html` for web routes. Proxy `/api/*` to the backend, removing `/api`, and proxy `/ws/constellation` with WebSocket upgrade support. `npm run preview` serves the bundle for inspection, not production.

For a backend on another origin, copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_API_BASE` and `VITE_GRAPH_WS` before building. Use HTTPS/WSS on secure deployments. Values in frontend environment variables are public and must not contain credentials.

## Data and capability limits

- List/search responses are hydrated from the existing thesis detail endpoint in batches of eight. Author names can also be read from linked Student nodes. The interface displays up to 500 matching records and reports that limit.
- Consent, thesis licence, citations, reads, and public PDF links are shown only when present in a record. Missing values are marked “Not recorded”. A software licence is never assigned to a thesis.
- The existing backend has no public PDF download route. Local file paths are not presented as downloads.
- Questions currently use the thesis abstract. Replies are backend output, including its explicit offline fallback. They are not evidence that full-text retrieval is available.
- Oracle scores are archive heuristics. They do not establish scientific novelty or feasibility. Dream passages are graph walks, not predictions. The interface does not claim that a nightly scheduler is configured.
- The graph depends on the existing live WebSocket endpoint. If WebGL is unavailable, streamed records remain available as ordinary links.
- This release does not claim a measured sub-300ms live archive load. Initial record hydration and service/model latency must be measured on the target installation.

See [release notes](docs/releases/v0.2.0-alpha.md) for scope and validation.
