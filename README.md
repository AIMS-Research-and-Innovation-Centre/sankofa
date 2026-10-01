# 🌌 Sankofa

> *"The thesis that remembers you back."*

Sankofa is a thesis repository for AIMS — reimagined not as a filing
cabinet, but as a living archive. The name comes from the Akan (Ghana)
concept: *"Go back and fetch it."*

## What works today (v0.1.0-alpha)

- 📥 **Ingest**  — a PDF becomes a thesis node in the graph + vector store
- 🗣️ **Whisper** — chat with any ingested thesis
- 🔮 **Oracle**  — propose unwritten theses from the graph's shape
- 💭 **Dream**   — random walk → poem, published nightly

## Quickstart

```bash
git clone https://github.com/Naphymoro/sankofa.git
cd sankofa
cp .env.example .env
make bootstrap
make seed
make smoke        # end-to-end check
make dev          # API at :8000
