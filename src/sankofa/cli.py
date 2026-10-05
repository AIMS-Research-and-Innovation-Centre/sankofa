"""Sankofa CLI — the archive from the terminal."""
from __future__ import annotations
from pathlib import Path
import typer

app = typer.Typer(help="Sankofa — the archive that remembers you back.", no_args_is_help=True)


@app.command()
def ingest(pdf: Path, author: str = typer.Option("", "--author"),
           campus: str = typer.Option("", "--campus"),
           year: int = typer.Option(0, "--year")) -> None:
    """Ingest a thesis PDF into the archive."""
    from .ingestion.pipeline import ingest as do_ingest
    tid = do_ingest(pdf, author=author, campus=campus, year=year)
    typer.echo(f"✅ ingested: {tid}")


@app.command()
def whisper(id: str = typer.Option(..., "--id"),
            q: str = typer.Option(..., "--q")) -> None:
    """Ask a thesis a question."""
    from .agents.interlocutor.agent import Interlocutor
    resp = Interlocutor(id).ask(q)
    typer.echo(f"\n🗣️  {resp['answer']}\n")


@app.command()
def oracle(topic: str = typer.Option(..., "--topic"),
           k: int = typer.Option(5, "--k")) -> None:
    """Ask the Oracle for an unwritten thesis."""
    from .agents.oracle.agent import Oracle
    typer.echo(f"\n🔮  The Oracle contemplates '{topic}'...\n")
    for i, idea in enumerate(Oracle().propose(topic, top_k=k), 1):
        typer.echo(f"{i}. {idea['title']}")
        typer.echo(f"   novelty={idea['novelty']}  feasibility={idea['feasible']}")
        typer.echo(f"   → {idea['rationale']}\n")


@app.command()
def dream() -> None:
    """Let the archive dream."""
    from .agents.dreamer.agent import Dreamer
    d = Dreamer().dream(steps=6)
    typer.echo(f"\n💭  {d['id']}\n")
    typer.echo(d["text"])


@app.command()
def chat() -> None:
    """Open an interactive Sankofa session."""
    from .repl import run
    run()


@app.command()
def mcp() -> None:
    """Serve the archive to MCP clients (e.g. Hermes Agent) over stdio."""
    from .mcp_server import server
    server.run("stdio")


@app.command()
def verify() -> None:
    """Check that every subsystem is alive."""
    import subprocess
    subprocess.run(["bash", "scripts/verify.sh"], check=False)


if __name__ == "__main__":
    app()
