"""Python package shim exposing the Codex-30 Registrar assets."""
from __future__ import annotations

from pathlib import Path
from typing import List

_BASE_DIR = Path(__file__).resolve().parent.parent / "30-registrar"
__path__: List[str] = [str(_BASE_DIR)]
