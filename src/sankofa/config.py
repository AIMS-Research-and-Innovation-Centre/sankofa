"""Configuration. Explicit is better than implicit."""
from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="LA_", extra="ignore")

    event_store_path: str = Field(default="./data/events.ndjson")
    neo4j_uri: str = Field(default="bolt://localhost:7687")
    neo4j_user: str = Field(default="neo4j")
    neo4j_password: str = Field(default="livingarchive")
    qdrant_url: str = Field(default="http://localhost:6333")
    qdrant_collection: str = Field(default="theses")
    embedding_model: str = Field(default="sentence-transformers/all-MiniLM-L6-v2")
    ollama_host: str = Field(default="http://localhost:11434")
    ollama_model: str = Field(default="deepseek-r1:1.5b")
    anthropic_api_key: str | None = None
    require_consent: bool = True
    audit_log_path: str = Field(default="./data/audit.ndjson")
    # Base URL of the web interface, used for links in agent (MCP) results.
    public_url: str = Field(default="")
    # Extra Host headers the /mcp endpoint accepts (e.g. ["archive.aims.ac.za"]).
    mcp_allowed_hosts: list[str] = Field(default_factory=list)
    # Thesis landing page; {base} is public_url. Hash routing matches the GitHub Pages build.
    record_url_template: str = Field(default="{base}/#/thesis/{id}")
    # Bearer token for curator actions (metadata edits, DOIs). Unset disables them.
    curator_token: str | None = None
    # DataCite. Defaults to the test system; production is https://api.datacite.org.
    datacite_api_url: str = Field(default="https://api.test.datacite.org")
    datacite_repository_id: str | None = None
    datacite_password: str | None = None
    datacite_prefix: str | None = None
    # ROR IDs for Centre affiliations, e.g. {"rwanda": "https://ror.org/..."}.
    centre_ror: dict[str, str] = Field(default_factory=dict)
    # DSpace 10.1 REST API (the authoritative repository of record).
    dspace_url: str = Field(default="")
    dspace_timeout: float = Field(default=30.0, gt=0, le=300)
    session_secret: str = Field(default="change-me-in-production", min_length=8)
    session_cookie_secure: bool = False
    dspace_public_group: str = "anonymous"
    dspace_librarian_group: str = "AIMS Librarians"
    dspace_editor_group: str = "AIMS Network Editors"


@lru_cache
def settings() -> Settings:
    return Settings()
