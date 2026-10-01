from sankofa.substrate.event_store import EventStore
from sankofa.substrate.event_types import ThesisSubmitted
from sankofa.substrate.projections import project


def test_append_and_replay():
    store = EventStore("./data/test_events.ndjson")
    store.append(ThesisSubmitted(payload=dict(
        thesis_id="t1", title="On Stochastic SIR", author="ada",
        campus="rwanda", year=2022, abstract="…")))

    state = project(store)
    assert "t1" in state.theses
    assert state.theses["t1"].campus == "rwanda"
