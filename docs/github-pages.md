# GitHub Pages

The UI is configured for https://naphymoro.github.io/sankofa/.

The repository root contains a compiled `index.html`, `assets/`, and `.nojekyll` for the existing **Deploy from a branch → main → / (root)** Pages configuration. This prevents GitHub Pages from rendering the README as the homepage. Do not copy `frontend/index.html` alone: it references TypeScript source, which a static server cannot compile.

To update this branch-based publication, run `npm ci` and `npm run pages:publish` in `frontend`, then commit the generated root `index.html` and `assets/` along with the source changes. `pages:publish` performs a production build with the `/sankofa/` base and hash routing before copying the output. Keep `.nojekyll` in the repository root. GitHub's branch publication runs after the push.

For automatic frontend builds, change Settings → Pages → Build and deployment to **GitHub Actions**. The connected GitHub tools do not expose this administration setting. The branch-based publication above works without that change.

The `Deploy UI to GitHub Pages` workflow builds and publishes `frontend/dist` on changes to the frontend on `main`. It can also be run manually from Actions. Assets use `/sankofa/`, and hash routes such as `/sankofa/#/about` support direct links, reloads, and browser history without server rewrites. Regular local development keeps its original routes.

GitHub Pages hosts static files only. It does not run the Python API, Neo4j, Qdrant, or Ollama. Until an externally hosted backend is connected, the site displays a clear archive service status and does not present sample data as real research.

To connect a hosted backend, add repository Actions variables:

- `SANKOFA_API_URL`: public HTTPS URL of the existing archive API.
- `SANKOFA_GRAPH_WS`: public WSS URL ending in `/ws/constellation`.

Re-run the deployment workflow after changing the variables. These URLs are public build configuration, not credentials. Ensure the backend accepts requests from `https://naphymoro.github.io`.

For a local Pages build: `VITE_PAGES=true npm run build` from `frontend`.
