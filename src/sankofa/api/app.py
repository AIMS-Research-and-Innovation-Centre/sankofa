"""FastAPI app — the archive's public face."""
from __future__ import annotations
from contextlib import AsyncExitStack, asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from ..logging import configure_logging, log
from ..config import settings
from .rest import health, theses, chat, oracle, dreams, agents, constellation, centres, notebook, curation, auth, repository

try:  # The MCP endpoint is optional: install with `pip install sankofa[agents]`.
    from ..mcp_server import http_app as mcp_http_app, server as mcp_server
except ImportError:  # pragma: no cover - depends on installed extras
    mcp_server = None


class _McpMount:
    """Stable mount for /mcp whose inner app is rebuilt at each startup.

    The MCP session manager can only run once, so a fresh one is made per lifespan.
    """

    def __init__(self) -> None:
        self.app = None

    async def __call__(self, scope, receive, send):  # type: ignore[no-untyped-def]
        if self.app is None:
            from starlette.responses import PlainTextResponse
            return await PlainTextResponse("MCP endpoint is starting", 503)(scope, receive, send)
        await self.app(scope, receive, send)


mcp_mount = _McpMount()


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    log.info("api.startup", mcp=mcp_server is not None)
    async with AsyncExitStack() as stack:
        if mcp_server is not None:
            mcp_mount.app = mcp_http_app()
            await stack.enter_async_context(mcp_server.session_manager.run())
        yield
        mcp_mount.app = None
    log.info("api.shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Sankofa",
        description="An agential thesis archive for AIMS.",
        version="0.1.0-alpha",
        lifespan=lifespan,
    )
    allowed_origins = ["http://localhost:5173", "https://sankofa-web.couma.workers.dev"]
    if settings().public_url and settings().public_url not in allowed_origins:
        allowed_origins.append(settings().public_url)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins, allow_methods=["*"], allow_headers=["*"],
        allow_credentials=True,
    )
    app.include_router(health.router, tags=["health"])
    app.include_router(auth.router, prefix="/auth", tags=["auth"])
    app.include_router(repository.router, prefix="/repository", tags=["repository"])
    app.include_router(curation.router, prefix="/theses", tags=["curation"])
    app.include_router(theses.router, prefix="/theses", tags=["theses"])
    app.include_router(curation.report_router, prefix="/curation", tags=["curation"])
    app.include_router(chat.router, prefix="/chat", tags=["chat"])
    app.include_router(oracle.router, prefix="/oracle", tags=["oracle"])
    app.include_router(dreams.router, prefix="/dreams", tags=["dreams"])
    app.include_router(agents.router, prefix="/agents", tags=["agents"])
    app.include_router(constellation.router, tags=["constellation"])
    app.include_router(centres.router, prefix="/centres", tags=["centres"])
    app.include_router(notebook.router, prefix="/notebook", tags=["notebook"])
    if mcp_server is not None:
        app.mount("/mcp", mcp_mount)

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
