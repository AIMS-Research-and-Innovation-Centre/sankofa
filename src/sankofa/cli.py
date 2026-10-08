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


metadata_app = typer.Typer(help="Curate thesis metadata.")
doi_app = typer.Typer(help="Reserve and register DataCite DOIs.")
app.add_typer(metadata_app, name="metadata")
app.add_typer(doi_app, name="doi")


@metadata_app.command("import")
def metadata_import(csv_file: Path, dry_run: bool = typer.Option(False, "--dry-run")) -> None:
    """Import metadata from the roadmap's CSV template (multi-values joined by ||)."""
    from .metadata_import import read
    records, errors = read(csv_file)
    for error in errors:
        typer.echo(f"skipped {error}", err=True)
    if not dry_run:
        from .api.rest.curation import reindex, save
        for meta in records:
            save(meta, create=True, actor="metadata-import")
            reindex(meta)
    typer.echo(f"{'checked' if dry_run else 'imported'} {len(records)} records, skipped {len(errors)}")


@metadata_app.command("report")
def metadata_report(show: int = typer.Option(20, "--show")) -> None:
    """Metadata completeness across the archive, worst first."""
    from .api.rest.curation import report
    r = report()
    typer.echo(f"{r['theses']} theses · required fields {r['required_completeness']}% complete (target 95%) · "
               f"{r['doi_ready']} DOI-ready · {r['registered']} registered")
    for row in sorted((x for x in r["rows"] if "score" in x), key=lambda x: x["score"])[:show]:
        typer.echo(f"{row['score']:>3}%  {row['id']}  missing: {', '.join(row['missing_required'] + row['missing_recommended']) or 'nothing'}")


def _doi(thesis_id: str, action: str) -> None:
    from fastapi import HTTPException
    from .api.rest.curation import DoiAction, doi
    try:
        result = doi(thesis_id, DoiAction(action=action))  # type: ignore[arg-type]
    except HTTPException as e:
        typer.echo(f"error: {e.detail}", err=True)
        raise typer.Exit(1) from e
    typer.echo(f"{thesis_id}: {result['doi'] or 'no DOI'} ({result['doi_state'] or 'discarded'})")


@doi_app.command("reserve")
def doi_reserve(thesis_id: str) -> None:
    """Reserve (or refresh) a draft DOI. Drafts can be changed or discarded."""
    _doi(thesis_id, "reserve")


@doi_app.command("register")
def doi_register(thesis_id: str, yes: bool = typer.Option(False, "--yes", help="Confirm: registered DOIs are permanent.")) -> None:
    """Make a draft DOI findable. This cannot be undone."""
    if not yes:
        typer.confirm(f"Register the DOI for {thesis_id}? Registered DOIs are permanent.", abort=True)
    _doi(thesis_id, "register")


@doi_app.command("discard")
def doi_discard(thesis_id: str) -> None:
    """Delete a draft DOI."""
    _doi(thesis_id, "discard")


@app.command()
def verify() -> None:
    """Check that every subsystem is alive."""
    import subprocess
    subprocess.run(["bash", "scripts/verify.sh"], check=False)


if __name__ == "__main__":
    app()
