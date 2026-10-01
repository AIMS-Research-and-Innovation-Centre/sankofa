from pathlib import Path
import orjson

DREAMS_DIR = Path("./data/dreams")
DREAMS_DIR.mkdir(parents=True, exist_ok=True)


def save_dream(dream: dict) -> Path:
    path = DREAMS_DIR / f"{dream['id']}.json"
    path.write_bytes(orjson.dumps(dream, option=orjson.OPT_INDENT_2))
    return path


def recent(limit: int = 10) -> list[dict]:
    files = sorted(DREAMS_DIR.glob("dream-*.json"), reverse=True)[:limit]
    return [orjson.loads(f.read_bytes()) for f in files]
