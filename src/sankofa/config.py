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


@lru_cache
def settings() -> Settings:
    return Settings()
