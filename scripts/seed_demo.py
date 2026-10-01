"""Seed the archive with two synthetic theses — no PDFs required."""
from sankofa.substrate.event_store import event_store
from sankofa.substrate.event_types import ThesisSubmitted, ConceptLinked
from sankofa.graph.client import graph
from sankofa.graph.embeddings.encoder import encode_one
from sankofa.graph.embeddings.qdrant_client import vectors

DEMO = [
    {
        "id": "aims-demo-2019-gh-001",
        "title": "Stochastic SIR Models for Malaria in Northern Ghana",
        "author": "ada", "campus": "ghana", "year": 2019,
        "abstract": "We develop a stochastic SIR model for malaria transmission in "
                    "Northern Ghana, calibrating rainfall and temperature covariates.",
        "concepts": ["stochastic", "sir", "malaria", "bayesian", "rainfall"],
    },
    {
        "id": "aims-demo-2022-rw-002",
        "title": "Topological Data Analysis of Climate Networks",
        "author": "keza", "campus": "rwanda", "year": 2022,
        "abstract": "We apply persistent homology to East African rainfall networks, "
                    "revealing manifold structure in climate teleconnections.",
        "concepts": ["topology", "manifold", "rainfall", "climate", "fourier"],
    },
]


def main() -> None:
    g = graph()
    v = vectors()
    for t in DEMO:
        event_store().append(ThesisSubmitted(payload=t))
        g.upsert_thesis(id=t["id"], title=t["title"], abstract=t["abstract"],
                        year=t["year"], campus=t["campus"], author=t["author"],
                        file_path="(demo)")
        for c in t["concepts"]:
            g.link_concept(t["id"], c)
            event_store().append(ConceptLinked(
                payload={"thesis_id": t["id"], "concept_id": c.lower()}))
        v.upsert(t["id"], encode_one(t["abstract"]),
                 payload={"title": t["title"], "year": t["year"]})
        print(f"  ✅ seeded {t['id']} — {t['title']}")
    print(f"\n🌌 {len(DEMO)} demo theses live.")


if __name__ == "__main__":
    main()
