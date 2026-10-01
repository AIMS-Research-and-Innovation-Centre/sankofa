import os
from pathlib import Path
import pytest

os.environ.setdefault("LA_EVENT_STORE_PATH", "./data/test_events.ndjson")


@pytest.fixture(autouse=True)
def clean_events():
    p = Path(os.environ["LA_EVENT_STORE_PATH"])
    p.parent.mkdir(parents=True, exist_ok=True)
    p.unlink(missing_ok=True)
    yield
    p.unlink(missing_ok=True)
