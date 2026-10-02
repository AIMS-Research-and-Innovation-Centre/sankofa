# GitHub Pages

The UI is configured for https://naphymoro.github.io/sankofa/.

In repository Settings → Pages → Build and deployment, select **GitHub Actions** as the source. The connected GitHub tools do not expose this administration setting.

The `Deploy UI to GitHub Pages` workflow builds and publishes `frontend/dist` on changes to the frontend on `main`. It can also be run manually from Actions. Assets use `/sankofa/`, and hash routes such as `/sankofa/#/about` support direct links, reloads, and browser history without server rewrites. Regular local development keeps its original routes.

GitHub Pages hosts static files only. It does not run the Python API, Neo4j, Qdrant, or Ollama. Until an externally hosted backend is connected, the site displays a clear archive service status and does not present sample data as real research.

To connect a hosted backend, add repository Actions variables:

- `SANKOFA_API_URL`: public HTTPS URL of the existing archive API.
- `SANKOFA_GRAPH_WS`: public WSS URL ending in `/ws/constellation`.

Re-run the deployment workflow after changing the variables. These URLs are public build configuration, not credentials. Ensure the backend accepts requests from `https://naphymoro.github.io`.

For a local Pages build: `VITE_PAGES=true npm run build` from `frontend`.
