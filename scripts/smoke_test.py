"""End-to-end smoke test: ingest → whisper → oracle → dream."""
import sys


def step(msg: str) -> None:
    print(f"\n▶ {msg}")


def main() -> int:
    failures = 0

    step("1. Substrate — append + replay")
    try:
        from sankofa.substrate.event_store import event_store
        from sankofa.substrate.event_types import ThesisSubmitted
        n_before = event_store().count()
        event_store().append(ThesisSubmitted(payload={"thesis_id": "smoke-1"}))
        assert event_store().count() == n_before + 1
        print("   ✅ events work")
    except Exception as e:  # noqa: BLE001
        print(f"   ❌ {e}"); failures += 1

    step("2. Curator — concept extraction")
    try:
        from sankofa.agents.curator.agent import Curator
        cs = Curator().extract_concepts(
            "stochastic SIR malaria bayesian inference")
        assert cs, "no concepts extracted"
        print(f"   ✅ concepts: {cs[:5]}")
    except Exception as e:  # noqa: BLE001
        print(f"   ❌ {e}"); failures += 1

    step("3. Graph — Neo4j reachable")
    try:
        from sankofa.graph.client import graph
        n = graph().run("MATCH (n) RETURN count(n) AS n")[0]["n"]
        print(f"   ✅ graph has {n} nodes")
    except Exception as e:  # noqa: BLE001
        print(f"   ❌ {e}"); failures += 1

    step("4. Vectors — Qdrant reachable")
    try:
        from sankofa.graph.embeddings.qdrant_client import vectors
        n = vectors().client.count(vectors().collection).count
        print(f"   ✅ {n} vectors stored")
    except Exception as e:  # noqa: BLE001
        print(f"   ❌ {e}"); failures += 1

    step("5. Interlocutor — whisper")
    try:
        from sankofa.agents.interlocutor.agent import Interlocutor
        ans = Interlocutor("aims-demo-2019-gh-001").ask("What model do you use?")
        print(f"   ✅ answer: {ans['answer'][:80]}...")
    except Exception as e:  # noqa: BLE001
        print(f"   ❌ {e}"); failures += 1

    print(f"\n{'✅ all passed' if failures == 0 else f'❌ {failures} failures'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
