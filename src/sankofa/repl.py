"""Sankofa REPL — an interactive shell for the archive."""
from __future__ import annotations
import shlex
from prompt_toolkit import PromptSession
from prompt_toolkit.history import FileHistory
from prompt_toolkit.styles import Style
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table

console = Console()
style = Style.from_dict({"prompt": "ansiblue bold"})

BANNER = """[bold blue]🌌 Sankofa[/bold blue] — interactive mode
Type [yellow]/help[/yellow] for commands, [yellow]/exit[/yellow] to quit."""


class Session:
    def __init__(self) -> None:
        self.thesis_id: str | None = None

    def prompt(self) -> str:
        tag = self.thesis_id or "no thesis"
        return f"sankofa [{tag}]> "

    def run(self) -> None:
        console.print(Panel(BANNER, border_style="blue"))
        ps = PromptSession(history=FileHistory(".sankofa_history"))

        while True:
            try:
                line = ps.prompt(self.prompt(), style=style).strip()
            except (EOFError, KeyboardInterrupt):
                console.print("\n[dim]Bye.[/dim]")
                return

            if not line:
                continue

            if line.startswith("/"):
                if not self.slash(line):
                    return
            else:
                self.ask(line)

    def slash(self, line: str) -> bool:
        parts = shlex.split(line)
        cmd, args = parts[0], parts[1:]

        if cmd in ("/exit", "/quit"):
            console.print("[dim]Bye.[/dim]")
            return False

        if cmd == "/help":
            self.show_help()
        elif cmd == "/theses":
            self.list_theses()
        elif cmd == "/use" and args:
            self.thesis_id = args[0]
            console.print(f"[green]✅ talking to {self.thesis_id}[/green]")
        elif cmd == "/search" and args:
            self.search(" ".join(args))
        elif cmd == "/oracle" and args:
            self.oracle(" ".join(args))
        elif cmd == "/dream":
            self.dream()
        elif cmd == "/dreams":
            self.dreams()
        elif cmd == "/health":
            self.health()
        else:
            console.print(f"[red]unknown command: {cmd}[/red]")

        return True

    def ask(self, q: str) -> None:
        if not self.thesis_id:
            console.print("[red]no thesis selected. use /theses then /use <id>[/red]")
            return
        from .agents.interlocutor.agent import Interlocutor
        with console.status("[dim]thinking...[/dim]"):
            resp = Interlocutor(self.thesis_id).ask(q)
        console.print(Panel(Markdown(resp["answer"]), title="🗣️  thesis", border_style="yellow"))

    def list_theses(self) -> None:
        from .graph.client import graph
        rows = graph().run(
            "MATCH (t:Thesis) RETURN t.id AS id, t.title AS title, t.year AS year ORDER BY t.year DESC LIMIT 50"
        )
        table = Table(title="Theses")
        table.add_column("ID", style="cyan")
        table.add_column("Title")
        table.add_column("Year", justify="right")
        for r in rows:
            table.add_row(r["id"], r["title"], str(r["year"]))
        console.print(table)

    def search(self, query: str) -> None:
        from .graph.embeddings.hybrid_search import hybrid_search
        with console.status("[dim]searching...[/dim]"):
            results = hybrid_search(query, limit=10)
        table = Table(title=f"Results for: {query}")
        table.add_column("Thesis ID", style="cyan")
        table.add_column("Score", justify="right")
        for r in results:
            table.add_row(r["thesis_id"], f"{r['score']:.3f}")
        console.print(table)

    def oracle(self, topic: str) -> None:
        from .agents.oracle.agent import Oracle
        with console.status("[dim]the oracle contemplates...[/dim]"):
            ideas = Oracle().propose(topic, top_k=5)
        if not ideas:
            console.print("[dim]the archive is too sparse.[/dim]")
            return
        for i, idea in enumerate(ideas, 1):
            console.print(
                f"[bold]{i}. {idea['title']}[/bold]\n"
                f"   novelty={idea['novelty']}  feasibility={idea['feasible']}\n"
                f"   [dim]→ {idea['rationale']}[/dim]\n"
            )

    def dream(self) -> None:
        from .agents.dreamer.agent import Dreamer
        with console.status("[dim]dreaming...[/dim]"):
            d = Dreamer().dream(steps=6)
        console.print(Panel(d["text"], title=f"💭  {d['id']}", border_style="magenta"))

    def dreams(self) -> None:
        from .agents.dreamer.dream_archive import recent
        for d in recent(limit=5):
            console.print(Panel(d["text"], title=f"💭  {d['id']}", border_style="magenta"))

    def health(self) -> None:
        import httpx
        try:
            r = httpx.get("http://localhost:8001/health", timeout=3.0)
            console.print_json(data=r.json())
        except Exception as e:
            console.print(f"[red]{e}[/red]")

    def show_help(self) -> None:
        console.print(Panel(
            "[yellow]/help[/yellow]         show this\n"
            "[yellow]/theses[/yellow]       list all theses\n"
            "[yellow]/use <id>[/yellow]     select a thesis\n"
            "[yellow]/search <q>[/yellow]   hybrid search\n"
            "[yellow]/oracle <topic>[/yellow]  research gaps\n"
            "[yellow]/dream[/yellow]        trigger a dream\n"
            "[yellow]/dreams[/yellow]       recent dreams\n"
            "[yellow]/health[/yellow]       system status\n"
            "[yellow]/exit[/yellow]         quit\n\n"
            "[dim]Any other text is sent to the selected thesis.[/dim]",
            title="Commands", border_style="blue",
        ))


def run() -> None:
    Session().run()
