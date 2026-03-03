"""Minimal LLM service backed by Ollama with fallbacks.

Priority order:
  1. Ollama (local, no external dependency) — configured via ``OLLAMA_BASE_URL``
     (default ``http://localhost:11434``) and ``OLLAMA_MODEL``
     (default ``llama3.1``).
  2. HuggingFace transformers pipeline — enabled when ``LUCIDIA_USE_MODEL=1``
     and the ``transformers`` library is installed.
  3. Echo stub — always available as a last resort.
"""

from __future__ import annotations

import logging
import os
from typing import List

import requests
from fastapi import FastAPI
from pydantic import BaseModel

try:  # Optional heavy dependency
    from transformers import pipeline
except Exception:  # pragma: no cover - transformers may be absent
    pipeline = None  # type: ignore

logger = logging.getLogger(__name__)

app = FastAPI(title="Lucidia LLM")


class Msg(BaseModel):
    role: str
    content: str


class ChatReq(BaseModel):
    messages: List[Msg]


OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "120"))
MODEL_NAME = os.getenv("LUCIDIA_MODEL", "meta-llama/Meta-Llama-3-8B-Instruct")
USE_MODEL = os.getenv("LUCIDIA_USE_MODEL") == "1"
_pipe = None


def _ollama_chat(messages: List[Msg]) -> str | None:
    """Attempt a chat completion via local Ollama. Returns None on failure."""
    try:
        payload = {
            "model": OLLAMA_MODEL,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": False,
        }
        r = requests.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload, timeout=OLLAMA_TIMEOUT)
        r.raise_for_status()
        data = r.json()
        return data.get("message", {}).get("content") or ""
    except Exception as exc:  # pragma: no cover - Ollama may not be running
        logger.warning("Ollama request failed, falling back: %s", exc)
        return None


def _get_pipe():
    """Lazily initialise the HuggingFace text-generation pipeline."""

    global _pipe
    if not USE_MODEL or pipeline is None:
        return None
    if _pipe is None:
        _pipe = pipeline("text-generation", model=MODEL_NAME)
    return _pipe


@app.get("/health")
def health():
    return {"ok": True, "service": "lucidia-llm"}


@app.post("/chat")
def chat(req: ChatReq):
    last = req.messages[-1].content if req.messages else "(empty)"

    # 1. Try Ollama first (local, no external dependency)
    ollama_content = _ollama_chat(req.messages)
    if ollama_content is not None:
        return {"choices": [{"role": "assistant", "content": ollama_content}]}

    # 2. Try HuggingFace transformers pipeline
    pipe = _get_pipe()
    if pipe is not None:
        result = pipe(last, max_new_tokens=60)
        first = result[0]
        if isinstance(first, dict):
            content = first.get("generated_text") or first.get("text") or ""
        elif hasattr(first, "generated_text") or hasattr(first, "text"):
            content = getattr(first, "generated_text", None) or getattr(first, "text", "")
        else:  # pragma: no cover - transformers may change return type in future
            content = str(first)
        return {"choices": [{"role": "assistant", "content": content}]}

    # 3. Echo stub fallback
    return {"choices": [{"role": "assistant", "content": f"Lucidia stub: {last}"}]}
