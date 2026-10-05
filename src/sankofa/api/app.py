"""FastAPI app — the archive's public face."""
from __future__ import annotations
from contextlib import AsyncExitStack, asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from ..logging import configure_logging, log
from .rest import health, theses, chat, oracle, dreams, agents, constellation, centres, notebook

try:  # The MCP endpoint is optional: install with `pip install sankofa[agents]`.
    from ..mcp_server import http_app as mcp_http_app, server as mcp_server
except ImportError:  # pragma: no cover - depends on installed extras
    mcp_server = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    log.info("api.startup", mcp=mcp_server is not None)
    async with AsyncExitStack() as stack:
        if mcp_server is not None:
            await stack.enter_async_context(mcp_server.session_manager.run())
        yield
    log.info("api.shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Sankofa",
        description="An agential thesis archive for AIMS.",
        version="0.1.0-alpha",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
        allow_credentials=False,
    )
    app.include_router(health.router, tags=["health"])
    app.include_router(theses.router, prefix="/theses", tags=["theses"])
    app.include_router(chat.router, prefix="/chat", tags=["chat"])
    app.include_router(oracle.router, prefix="/oracle", tags=["oracle"])
    app.include_router(dreams.router, prefix="/dreams", tags=["dreams"])
    app.include_router(agents.router, prefix="/agents", tags=["agents"])
    app.include_router(constellation.router, tags=["constellation"])
    app.include_router(centres.router, prefix="/centres", tags=["centres"])
    app.include_router(notebook.router, prefix="/notebook", tags=["notebook"])
    if mcp_server is not None:
        app.mount("/mcp", mcp_http_app())

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    def root() -> str:
        return """<html><head><title>Sankofa</title>
        <style>body{background:#050514;color:#cdd6f4;font-family:system-ui;
        display:flex;align-items:center;justify-content:center;height:100vh;
        margin:0;text-align:center}h1{font-size:3rem;margin:0}
        p{opacity:.7;margin-top:1rem}a{color:#89b4fa;text-decoration:none}
        a:hover{text-decoration:underline}</style></head>
        <body><div><h1>🌌 Sankofa</h1>
        <p>The thesis that remembers you back.</p>
        <p><a href="/docs">API docs</a> · <a href="/health">Health</a> ·
        <a href="/theses/">Theses</a></p></div></body></html>"""

    return app


app = create_app()
