import os
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel

try:
    import httpx as _httpx
except Exception:  # pragma: no cover - httpx may be absent
    _httpx = None  # type: ignore

app = FastAPI(title="Lucidia LLM Stub", version="0.1.0")

OLLAMA_URL = os.getenv("OLLAMA_URL", "")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")


class ChatRequest(BaseModel):
    prompt: str
    system: Optional[str] = None
    stream: Optional[bool] = False


class ChatResponse(BaseModel):
    text: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    # Forward to local Ollama when OLLAMA_URL is configured.
    if OLLAMA_URL and _httpx is not None:
        try:
            messages = []
            if req.system:
                messages.append({"role": "system", "content": req.system})
            messages.append({"role": "user", "content": req.prompt})
            r = _httpx.post(
                f"{OLLAMA_URL}/api/chat",
                json={"model": OLLAMA_MODEL, "messages": messages, "stream": False},
                timeout=60,
            )
            r.raise_for_status()
            content = r.json().get("message", {}).get("content", "")
            return {"text": content}
        except Exception:  # pragma: no cover - Ollama may not be running
            pass
    # Echo stub fallback (tests / offline environments).
    prefix = (req.system + " ") if req.system else ""
    return {"text": f"{prefix}LLM stub response to: {req.prompt}"}
