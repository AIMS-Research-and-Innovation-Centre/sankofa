from sankofa.agents.notebook import agent

SOURCES = [
    {"id": "t1", "title": "Malaria", "abstract": "We build a stochastic SIR model. Rainfall drives transmission."},
    {"id": "t2", "title": "Climate", "abstract": "Persistent homology reveals structure. Rainfall networks are sparse."},
]


def test_extract_cites_matching_sentences():
    answer = agent.extract("What model is used for malaria?", SOURCES)
    assert "stochastic SIR model. [1]" in answer
    assert "[2]" not in answer.split("[1]")[0]


def test_extract_draws_on_several_sources():
    answer = agent.extract("rainfall", SOURCES)
    assert "[1]" in answer and "[2]" in answer


def test_ask_falls_back_to_extractive_without_a_model(monkeypatch):
    monkeypatch.setattr(agent, "complete", lambda system, user: None)
    monkeypatch.setattr(agent.Notebook, "sources", lambda self, ids: SOURCES)
    result = agent.Notebook().ask(["t1", "t2"], "rainfall")
    assert result["mode"] == "extractive"
    assert [s["n"] for s in result["sources"]] == [1, 2]


def test_ask_strips_reasoning_blocks(monkeypatch):
    monkeypatch.setattr(agent, "complete", lambda system, user: "<think>hmm</think>It uses SIR [1].")
    monkeypatch.setattr(agent.Notebook, "sources", lambda self, ids: SOURCES)
    assert agent.Notebook().ask(["t1"], "model?")["answer"] == "It uses SIR [1]."
