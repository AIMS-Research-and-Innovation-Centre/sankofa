FROM python:3.12-slim
WORKDIR /app
ADD https://github.com/Naphymoro/sankofa/archive/4ed4f18.tar.gz /tmp/sankofa.tar.gz
RUN mkdir /tmp/sankofa && tar -xzf /tmp/sankofa.tar.gz --strip-components=1 -C /tmp/sankofa
WORKDIR /tmp/sankofa
# The full semantic-search extra pulls CUDA/NVIDIA wheels. Cloudflare's
# repository/auth API does not need them at startup; AI ingestion remains
# available when the model service is deployed separately.
RUN pip install --no-cache-dir . --no-deps && \
    pip install --no-cache-dir \
      "fastapi>=0.115" "uvicorn[standard]>=0.30" "pydantic>=2.8" \
      "pydantic-settings>=2.4" "neo4j>=5.24" "qdrant-client>=1.11,<1.12" \
      "pymupdf>=1.24" "python-multipart>=0.0.9" "httpx>=0.27" \
      "structlog>=24.4" "orjson>=3.10" "numpy>=2.0" "typer>=0.12" \
      "prompt_toolkit>=3.0.47" "rich>=13.9"
WORKDIR /app
EXPOSE 8001
CMD ["uvicorn", "sankofa.api.app:app", "--host", "0.0.0.0", "--port", "8001"]
