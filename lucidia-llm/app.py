"""Minimal LLM service with Ollama-first local inference.

The service connects to a local Ollama instance by default so that all LLM
inference stays on your own hardware with **zero reliance on external
providers**.

Environment variables:
  ``OLLAMA_HOST``  – Ollama HTTP endpoint (default ``http://localhost:11434``)
  ``OLLAMA_MODEL`` – Model to use (default ``phi3:mini``)

If Ollama is unreachable the service falls back to a lightweight echo stub
so that unit tests can still run without a running Ollama daemon.

Legacy support: setting ``LUCIDIA_USE_MODEL=1`` with ``transformers``
installed will use the HuggingFace pipeline instead.
"""

import logging
import os
from typing import List, Optional

import httpx
from fastapi import FastAPI
from pydantic import BaseModel

try:  # Optional heavy dependency
    from transformers import pipeline
except Exception:  # pragma: no cover - transformers may be absent
    pipeline = None  # type: ignore

logger = logging.getLogger(__name__)

app = FastAPI(title="Lucidia LLM")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi3:mini")

MODEL_NAME = os.getenv("LUCIDIA_MODEL", "meta-llama/Meta-Llama-3-8B-Instruct")
USE_MODEL = os.getenv("LUCIDIA_USE_MODEL") == "1"
_pipe = None


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class Msg(BaseModel):
    role: str
    content: str


class ChatReq(BaseModel):
    messages: List[Msg]
    model: Optional[str] = None
    stream: Optional[bool] = False


# ---------------------------------------------------------------------------
# Ollama helpers
# ---------------------------------------------------------------------------
def _ollama_chat(messages: List[dict], model: Optional[str] = None) -> Optional[str]:
    """Send a chat request to the local Ollama instance.

    Returns the assistant content string, or ``None`` when Ollama is
    unreachable so callers can fall back gracefully.
    """
    url = f"{OLLAMA_HOST}/api/chat"
    payload = {
        "model": model or OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
    }
    try:
        resp = httpx.post(url, json=payload, timeout=120.0)
        resp.raise_for_status()
        data = resp.json()
        return data.get("message", {}).get("content", "")
    except Exception as exc:
        logger.warning("Ollama unreachable (%s), falling back to stub", exc)
        return None


def _ollama_models() -> Optional[List[str]]:
    """Return list of model names from the local Ollama instance."""
    try:
        resp = httpx.get(f"{OLLAMA_HOST}/api/tags", timeout=5.0)
        resp.raise_for_status()
        data = resp.json()
        return [m["name"] for m in data.get("models", []) if m.get("name")]
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Legacy HuggingFace pipeline
# ---------------------------------------------------------------------------
def _get_pipe():
    """Lazily initialise the text generation pipeline."""

    global _pipe
    if not USE_MODEL or pipeline is None:
        return None
    if _pipe is None:
        _pipe = pipeline("text-generation", model=MODEL_NAME)
    return _pipe


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    ollama_ok = _ollama_models() is not None
    return {"ok": True, "service": "lucidia-llm", "ollama": ollama_ok}


@app.get("/models")
def models():
    names = _ollama_models()
    if names is not None:
        return {"backend": "ollama", "models": names}
    return {"backend": "stub", "models": []}


@app.post("/chat")
def chat(req: ChatReq):
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    last = req.messages[-1].content if req.messages else "(empty)"

    # 1. Try Ollama (local, zero external dependency)
    ollama_content = _ollama_chat(messages, model=req.model)
    if ollama_content is not None:
        return {"choices": [{"role": "assistant", "content": ollama_content}]}

    # 2. Legacy HuggingFace pipeline fallback
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

    # 3. Echo stub (last resort – no external dependency needed)
    return {"choices": [{"role": "assistant", "content": f"Lucidia stub: {last}"}]}
