"""Temporary storage helpers for uploaded audio."""

from __future__ import annotations

import os
import secrets
from pathlib import Path
from typing import BinaryIO


TMP_DIR = Path(os.environ.get("BLACKROAD_TRANSCRIBE_TMP", "/tmp/blackroad-transcribe"))
TMP_DIR.mkdir(parents=True, exist_ok=True)


def _token(suffix: str | None = None) -> str:
    body = secrets.token_hex(16)
    if suffix:
        suffix = suffix if suffix.startswith(".") else f".{suffix}"
        return f"{body}{suffix}"
    return body


def allocate_path(filename: str | None = None) -> Path:
    """Return an absolute path under :data:`TMP_DIR` for the upload."""

    suffix = None
    if filename:
        suffix = Path(filename).suffix
    return (TMP_DIR / _token(suffix)).resolve()


def write_temp(stream: BinaryIO, filename: str | None = None) -> Path:
    """Persist *stream* to disk and return the resolved path."""

    dest = allocate_path(filename)
    with open(dest, "wb") as fh:
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            fh.write(chunk)
    return dest


__all__ = ["TMP_DIR", "allocate_path", "write_temp"]

"""Local file management for transcription uploads."""
