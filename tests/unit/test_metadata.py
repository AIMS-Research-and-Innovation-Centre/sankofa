import json
import pytest
from pydantic import ValidationError
from sankofa.metadata import Person, ThesisMetadata, completeness, from_node, node_fields


def full(**overrides):
    data = dict(id="t1", title="Stochastic SIR", authors=[{"family": "Owusu", "given": "Ama", "orcid": "0000-0002-1825-0097"}],
                supervisors=[{"family": "Mensah", "given": "Kofi"}], abstract="We model malaria.", keywords=["malaria"],
                msc=["92D30"], year=2019, date_issued="2019-06-30", centre="AIMS Ghana", programme="MSc",
                language="en", licence="CC-BY-4.0", title_fr="SIR stochastique", abstract_fr="Nous modélisons.")
    return ThesisMetadata.model_validate({**data, **overrides})


def test_people_parse_both_orders():
    assert Person.parse("Owusu, Ama").display == "Owusu, Ama"
    assert Person.parse("Ama  Owusu").display == "Owusu, Ama"
    single = Person.parse("Diop")
    assert (single.family, single.given, single.display) == ("Diop", "", "Diop")


def test_validation_normalises_and_rejects():
    meta = full(doi="https://doi.org/10.1234/ABC", centre="cape town")
    assert meta.doi == "10.1234/abc" and meta.centre == "south-africa"
    assert Person(family="X", orcid="https://orcid.org/0000-0002-1825-0097").orcid == "0000-0002-1825-0097"
    for bad in [{"orcid": "1234"}]:
        with pytest.raises(ValidationError):
            Person(family="X", **bad)
    for bad in [{"centre": "atlantis"}, {"licence": "MIT"}, {"date_issued": "30/06/2019"}, {"language": "eng"}, {"doi": "abc"}]:
        with pytest.raises(ValidationError):
            full(**bad)


def test_completeness_separates_required_from_recommended():
    assert completeness(full()) == {"score": 100, "required_score": 100, "missing_required": [],
                                    "missing_recommended": [], "doi_ready": True}
    sparse = ThesisMetadata(id="t2", title="Untitled", language=None)
    c = completeness(sparse)
    assert not c["doi_ready"] and "Author(s)" in c["missing_required"] and "Licence" in c["missing_required"]
    assert "Author ORCID" in c["missing_recommended"]


def test_graph_round_trip_keeps_curated_fields():
    meta = full(doi="10.1234/x", doi_state="draft")
    fields = node_fields(meta)
    assert fields["campus"] == "ghana" and fields["author"] == "Ama Owusu" and fields["doi_state"] == "draft"
    back = from_node({"id": "t1", **fields, "concepts": ["ignored, curated keywords win"]})
    assert back == meta
    assert json.loads(fields["meta"])["supervisors"][0]["family"] == "Mensah"


def test_legacy_node_without_curated_metadata():
    meta = from_node({"id": "old", "title": "T", "abstract": "A", "year": 2020, "campus": "rwanda",
                      "author": "keza", "concepts": ["topology"]})
    assert meta.centre == "rwanda" and meta.authors[0].family == "keza" and meta.keywords == ["topology"]
