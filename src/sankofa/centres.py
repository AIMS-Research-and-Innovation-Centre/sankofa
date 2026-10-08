"""AIMS Centres and communities — the controlled lists from the repository roadmap.

The roadmap (Section 4 and 5) names one community per Centre plus programme
communities that cut across Centres. Campus strings already in the graph are
free text ("ghana", "AIMS Ghana", "cape town"), so `resolve` maps them onto
the controlled list.
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict


@dataclass(frozen=True)
class Centre:
    slug: str
    name: str
    country: str
    city: str
    kind: str  # "centre" (teaching Centre) or "research"
    founded: int | None = None
    aliases: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict:
        data = asdict(self)
        data.pop("aliases")
        return data


CENTRES: tuple[Centre, ...] = (
    Centre("south-africa", "AIMS South Africa", "South Africa", "Cape Town", "centre", 2003,
           ("south africa", "southafrica", "za", "cape town", "muizenberg")),
    Centre("senegal", "AIMS Senegal", "Senegal", "Mbour", "centre", 2011,
           ("sn", "mbour", "dakar")),
    Centre("ghana", "AIMS Ghana", "Ghana", "Biriwa", "centre", 2012,
           ("gh", "biriwa", "accra")),
    Centre("cameroon", "AIMS Cameroon", "Cameroon", "Limbe", "centre", 2013,
           ("cm", "limbe")),
    Centre("rwanda", "AIMS Rwanda", "Rwanda", "Kigali", "centre", 2016,
           ("rw", "kigali")),
    Centre("tanzania", "AIMS Tanzania", "Tanzania", "Bagamoyo", "centre", 2014,
           ("tz", "bagamoyo", "tanzania")),
    Centre("ric", "AIMS Research and Innovation Centre", "Rwanda", "Kigali", "research", 2021,
           ("aims ric", "aims-ric", "research and innovation centre", "research & innovation centre")),
)

# Programme and theme communities (roadmap C2 to C5). C6 to C10 are reserved.
# Items join one through their recorded programme, never by guessing from keywords.
COMMUNITIES: tuple[dict, ...] = (
    {"id": "C2", "slug": "math-epi", "name": "Mathematical Epidemiology", "type": "Programme"},
    {"id": "C3", "slug": "climate", "name": "Climate Science", "type": "Programme or theme"},
    {"id": "C4", "slug": "ai", "name": "Artificial Intelligence", "type": "Programme or theme"},
    {"id": "C5", "slug": "ammi", "name": "African Master's in Machine Intelligence (AMMI)",
     "type": "Programme"},
)


def _key(value: str) -> str:
    return " ".join(value.lower().replace("_", " ").split())


_INDEX: dict[str, Centre] = {}
for _c in CENTRES:
    for _name in (_c.slug, _c.name, _c.country, _c.name.removeprefix("AIMS "), *_c.aliases):
        _INDEX.setdefault(_key(_name), _c)


def resolve(campus: str | None) -> Centre | None:
    """Map a free-text campus value onto a Centre, or None if it is unknown."""
    if not campus:
        return None
    key = _key(campus)
    return _INDEX.get(key) or _INDEX.get(key.removeprefix("aims "))
