from sankofa.agents.curator.agent import Curator


def test_extracts_domain_concepts():
    text = ("We develop a stochastic SIR model for malaria transmission, "
            "calibrated with Bayesian inference.")
    concepts = Curator().extract_concepts(text, top_k=8)
    joined = " ".join(concepts)
    assert "stochastic" in joined
    assert "malaria" in joined
