import logging
import os

import httpx
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)

app = FastAPI(title="Lucidia LLM Stub", version="0.2.0")

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi3:mini")


class ChatRequest(BaseModel):
    prompt: str
    system: Optional[str] = None
    stream: Optional[bool] = False


class ChatResponse(BaseModel):
    text: str


def _ollama_generate(prompt: str, system: str | None = None) -> str | None:
    """Forward a prompt to the local Ollama instance."""
    url = f"{OLLAMA_HOST}/api/generate"
    payload = {"model": OLLAMA_MODEL, "prompt": prompt, "stream": False}
    if system:
        payload["system"] = system
    try:
        resp = httpx.post(url, json=payload, timeout=120.0)
        resp.raise_for_status()
        data = resp.json()
        return data.get("response", "")
    except Exception as exc:
        logger.warning("Ollama unreachable (%s), falling back to stub", exc)
        return None


@app.get("/health")
def health():
    ollama_ok = False
    try:
        resp = httpx.get(f"{OLLAMA_HOST}/api/tags", timeout=5.0)
        ollama_ok = resp.status_code == 200
    except Exception:
        pass
    return {"status": "ok", "ollama": ollama_ok}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    # Try Ollama first – zero external provider dependency
    result = _ollama_generate(req.prompt, system=req.system)
    if result is not None:
        return {"text": result}

    # Fallback echo stub
    prefix = (req.system + " ") if req.system else ""
    return {"text": f"{prefix}LLM stub response to: {req.prompt}"}
