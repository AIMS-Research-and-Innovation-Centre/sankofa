"""Neo4j client — the archive's long-term memory."""
from __future__ import annotations
from contextlib import contextmanager
from typing import Any, Iterator
from neo4j import GraphDatabase, Driver
from ..config import settings


class GraphClient:
    def __init__(self) -> None:
        s = settings()
        self._driver: Driver = GraphDatabase.driver(
            s.neo4j_uri, auth=(s.neo4j_user, s.neo4j_password)
        )

    def close(self) -> None:
        self._driver.close()

    @contextmanager
    def session(self) -> Iterator[Any]:
        with self._driver.session() as s:
            yield s

    def run(self, cypher: str, **params: Any) -> list[dict]:
        with self.session() as s:
            return [r.data() for r in s.run(cypher, **params)]

    def upsert_thesis(self, **kw: Any) -> None:
        self.run(
            """
            MERGE (t:Thesis {id: $id})
            SET t.title = $title, t.abstract = $abstract,
                t.year = $year, t.campus = $campus
            WITH t
            MERGE (s:Student {id: $author})
            MERGE (s)-[:AUTHORED]->(t)
            MERGE (c:Campus {name: $campus})
            MERGE (t)-[:AT]->(c)
            """,
            **kw,
        )

    def link_concept(self, thesis_id: str, concept_name: str) -> None:
        self.run(
            """
            MATCH (t:Thesis {id: $tid})
            MERGE (c:Concept {id: toLower($name)})
            SET c.name = $name
            MERGE (t)-[:ABOUT]->(c)
            """,
            tid=thesis_id, name=concept_name,
        )


_client: GraphClient | None = None


def graph() -> GraphClient:
    global _client
    if _client is None:
        _client = GraphClient()
    return _client
