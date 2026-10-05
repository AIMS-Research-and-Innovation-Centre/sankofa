from sankofa.substrate.event_store import EventStore
from sankofa.substrate.event_types import ThesisSubmitted


def test_append_and_replay(tmp_path):
    store = EventStore(str(tmp_path / "events.ndjson"))
    store.append(ThesisSubmitted(payload=dict(
        thesis_id="t1", title="On Stochastic SIR", author="ada",
        campus="rwanda", year=2022, abstract="…")))

    events = list(store.stream())
    assert store.count() == 1
    assert events[0].type == "thesis.submitted"
    assert events[0].payload["thesis_id"] == "t1"
    assert events[0].payload["campus"] == "rwanda"
