import logging
import os
from typing import Optional

import requests
from fastapi import FastAPI
from pydantic import BaseModel

logger = logging.getLogger(__name__)

app = FastAPI(title="Lucidia LLM Stub", version="0.1.0")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "120"))


class ChatRequest(BaseModel):
    prompt: str
    system: Optional[str] = None
    stream: Optional[bool] = False


class ChatResponse(BaseModel):
    text: str


def _ollama_complete(prompt: str, system: Optional[str] = None) -> Optional[str]:
    """Try to get a completion from local Ollama. Returns None on failure."""
    try:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        payload = {"model": OLLAMA_MODEL, "messages": messages, "stream": False}
        r = requests.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload, timeout=OLLAMA_TIMEOUT)
        r.raise_for_status()
        return r.json().get("message", {}).get("content") or ""
    except Exception as exc:
        logger.warning("Ollama request failed, falling back: %s", exc)
        return None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    # Try Ollama first; fall back to echo stub when unavailable.
    ollama_text = _ollama_complete(req.prompt, req.system)
    if ollama_text is not None:
        return {"text": ollama_text}
    prefix = (req.system + " ") if req.system else ""
    return {"text": f"{prefix}LLM stub response to: {req.prompt}"}
