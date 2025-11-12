"""Minimal LLM service with optional open source model support.

The service defaults to a lightweight echo stub so that unit tests can run
without large model downloads.  If the ``LUCIDIA_USE_MODEL`` environment
variable is set to ``"1"`` and the ``transformers`` library is available, the
service will load ``meta-llama/Meta-Llama-3-8B-Instruct`` (or another model
specified via ``LUCIDIA_MODEL``) and use it to generate responses.
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

app = FastAPI(title="Lucidia LLM")


class Msg(BaseModel):
    role: str
    content: str


class ChatReq(BaseModel):
    messages: List[Msg]


MODEL_NAME = os.getenv("LUCIDIA_MODEL", "meta-llama/Meta-Llama-3-8B-Instruct")
USE_MODEL = os.getenv("LUCIDIA_USE_MODEL") == "1"
_pipe = None


def _get_pipe():
    """Lazily initialise the text generation pipeline."""

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
    pipe = _get_pipe()
    if pipe is None:
        content = f"Lucidia stub: {last}"
    else:
        result = pipe(last, max_new_tokens=60)
        first = result[0]
        if isinstance(first, dict):
            content = first.get("generated_text") or first.get("text") or ""
        elif hasattr(first, "generated_text") or hasattr(first, "text"):
            content = getattr(first, "generated_text", None) or getattr(first, "text", "")
        else:  # pragma: no cover - transformers may change return type in future
            content = str(first)
        if not content:
            content = ""
    return {"choices": [{"role": "assistant", "content": content}]}
