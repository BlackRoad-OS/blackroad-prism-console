from __future__ import annotations

import json
from pathlib import Path

from config.settings import settings


def _ensure_parent(path: Path) -> None:
    if settings.READ_ONLY:
        return
    path.parent.mkdir(parents=True, exist_ok=True)


def write_text(path: Path, content: str) -> None:
    _ensure_parent(path)
    if settings.READ_ONLY:
        return
    with path.open("w", encoding="utf-8") as fh:
        fh.write(content)


def append_text(path: Path, content: str) -> None:
    _ensure_parent(path)
    if settings.READ_ONLY:
        return
    with path.open("a", encoding="utf-8") as fh:
        fh.write(content)


def write_json(path: Path, data: dict) -> None:
    write_text(path, json.dumps(data, indent=2))
"""Stub storage adapter.

Provides a placeholder interface for persistent storage.
"""


def save(key: str, data: str) -> None:
    """Persist *data* under *key*.

    Raises
    ------
    NotImplementedError
        Always, since storage is not configured.
    """

    raise NotImplementedError("Persistent storage not configured")


def load_json(path: Path, default=None):
    """Load JSON from a file, returning default if it doesn't exist."""
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def save_json(path: Path, data) -> None:
    """Save data as JSON to a file."""
    _ensure_parent(path)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, default=str)


def read(path: str) -> str:
    """Read content from a file."""
    p = Path(path)
    if not p.exists():
        return ""
    return p.read_text(encoding="utf-8")


def write(path: str, content) -> None:
    """Write content to a file."""
    import json as _json
    p = Path(path)
    _ensure_parent(p)
    if isinstance(content, (dict, list)):
        p.write_text(_json.dumps(content, indent=2, default=str), encoding="utf-8")
    else:
        p.write_text(str(content), encoding="utf-8")
