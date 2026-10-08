from sankofa.centres import CENTRES, resolve


def test_controlled_list_has_seven_centres():
    assert [c.slug for c in CENTRES] == ["south-africa", "senegal", "ghana", "cameroon", "rwanda", "tanzania", "ric"]


def test_free_text_campus_values_resolve():
    assert resolve("ghana").slug == "ghana"
    assert resolve("AIMS Ghana").slug == "ghana"
    assert resolve("Cape Town").slug == "south-africa"
    assert resolve("south_africa").slug == "south-africa"
    assert resolve("rwanda").slug == "rwanda"
    assert resolve("AIMS RIC").slug == "ric"
    assert resolve("Tanzania").slug == "tanzania"
    assert resolve("Mbour").slug == "senegal"


def test_unknown_campus_is_none():
    assert resolve("") is None
    assert resolve(None) is None
    assert resolve("atlantis") is None
