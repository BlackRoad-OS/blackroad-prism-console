"""Minimal LLM service with Ollama-first support.

Priority order:
1. Ollama (when ``OLLAMA_URL`` is set, defaults to ``http://127.0.0.1:11434``)
2. HuggingFace transformers (when ``LUCIDIA_USE_MODEL=1`` and transformers is available)
3. Echo stub (fallback for tests / offline environments)
"""

from __future__ import annotations

import os
from typing import List

from fastapi import FastAPI
from pydantic import BaseModel

try:  # Optional heavy dependency
    from transformers import pipeline
except Exception:  # pragma: no cover - transformers may be absent
    pipeline = None  # type: ignore

try:
    import httpx as _httpx
except Exception:  # pragma: no cover - httpx may be absent
    _httpx = None  # type: ignore

app = FastAPI(title="Lucidia LLM")


class Msg(BaseModel):
    role: str
    content: str


class ChatReq(BaseModel):
    messages: List[Msg]


MODEL_NAME = os.getenv("LUCIDIA_MODEL", "meta-llama/Meta-Llama-3-8B-Instruct")
USE_MODEL = os.getenv("LUCIDIA_USE_MODEL") == "1"
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
_pipe = None


def _get_pipe():
    """Lazily initialise the text generation pipeline."""

    global _pipe
    if not USE_MODEL or pipeline is None:
        return None
    if _pipe is None:
        _pipe = pipeline("text-generation", model=MODEL_NAME)
    return _pipe


def _ollama_chat(messages: List[Msg]) -> str | None:
    """Call local Ollama and return the assistant content, or None on failure."""
    if _httpx is None:
        return None
    try:
        payload = {
            "model": os.getenv("OLLAMA_MODEL", "llama3.2"),
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": False,
        }
        r = _httpx.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=60)
        r.raise_for_status()
        return r.json().get("message", {}).get("content", "")
    except Exception:  # pragma: no cover - Ollama may not be running
        return None


@app.get("/health")
def health():
    return {"ok": True, "service": "lucidia-llm"}


@app.post("/chat")
def chat(req: ChatReq):
    last = req.messages[-1].content if req.messages else "(empty)"

    # 1. Try Ollama first (local hardware, no external providers)
    ollama_content = _ollama_chat(req.messages)
    if ollama_content is not None:
        return {"choices": [{"role": "assistant", "content": ollama_content}]}

    # 2. Fall back to HuggingFace pipeline if configured
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
        return {"choices": [{"role": "assistant", "content": content or ""}]}

    # 3. Echo stub fallback (offline / test environments)
    return {"choices": [{"role": "assistant", "content": f"Lucidia stub: {last}"}]}
