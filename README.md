# Sankofa

A thesis archive for the African Institute for Mathematical Sciences. Find, read, cite, and question theses, and follow connections across campuses and cohorts. The name comes from the Akan concept “Go back and fetch it.”

## v0.2.0-alpha web interface

- Search-first archive with abstracts, concept links, campus/year/concept filters, and sorting.
- Thesis detail pages with metadata, related records, inline questions, and BibTeX/RIS downloads.
- Separate Oracle, Dreams, Graph, and About pages.
- Light mode by default, persistent dark mode, responsive layouts, and keyboard navigation.
- A live Three.js graph, loaded only at `/graph`, with bounded zoom and no automatic rotation.

The Python backend, CLI, interactive terminal, and existing API remain unchanged.

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
| `/` | Archive and hybrid search |
| `/thesis/:id` | Read, ask questions, and cite |
| `/oracle` | Explore proposed research directions |
| `/dreams` | Read or trigger graph passages |
| `/graph` | Live graph and accessible thesis links |
| `/about` | Context, ethics, and keyboard guide |

| Key | Action |
| --- | --- |
| `/` | Focus search; open the archive if this view has no search |
| `j` / `k` | Next / previous archive result |
| `Enter` | Open the focused thesis |
| `g h` | Go to the archive |
| `g g` | Go to the graph |
| `Esc` | Clear the current search |
| `Tab` | Navigate all controls and links |

Shortcuts do not interrupt text entry. Filter, query, and sort state are stored in the URL. Browser back/forward and direct thesis links work.

## Production hosting

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
