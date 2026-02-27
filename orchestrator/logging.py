"""Structured logging helpers with trace IDs."""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict

from config.settings import settings


@dataclass
class Logger:
    level: str = settings.LOG_LEVEL

    def _log_path(self) -> Path:
        path = Path("data/memory.jsonl")
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def log(self, message: str, *, trace_id: str | None = None, **extra: Any) -> Dict[str, Any]:
        if trace_id is None:
            trace_id = str(uuid.uuid4())
        record = {"trace_id": trace_id, "level": self.level, "message": message}
        if extra:
            record.update(extra)
        with self._log_path().open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record) + "\n")
        return record


def generate_trace_id() -> str:
    return str(uuid.uuid4())


logger = Logger()
