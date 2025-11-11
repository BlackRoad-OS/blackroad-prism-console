import json
import os
from typing import Any, Dict

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from .deps import get_redis

try:  # Optional dependency for embeddings
    from redis.asyncio import Redis
except ImportError:  # pragma: no cover - optional dependency
    from typing import Any as Redis  # type: ignore[assignment]

router = APIRouter()


@router.get("/health")
async def health() -> Dict[str, bool]:
    return {"ok": True}


@router.post("/chat")
async def chat(payload: Dict[str, Any]) -> StreamingResponse:
    messages = payload.get("messages", [])
    if not isinstance(messages, list):
        raise HTTPException(status_code=400, detail="messages must be a list")

    async def event_stream():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                "http://localhost:11434/api/chat",
                json={"model": "mistral:7b", "messages": messages, "stream": True},
            ) as response:
                async for line in response.aiter_lines():
                    if line:
                        yield f"data: {line}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/embed")
async def embed(payload: Dict[str, Any], redis: Redis = Depends(get_redis)) -> Dict[str, Any]:
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    if len(text) > 8000:
        raise HTTPException(status_code=400, detail="text too long")
    key = f"embed:{hash(text)}"
    cached = await redis.get(key)
    if cached:
        return {"embedding": json.loads(cached)}

    headers = {"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY', '')}"}
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers=headers,
            json={"model": "text-embedding-3-large", "input": text},
        )
        resp.raise_for_status()
        embedding = resp.json()["data"][0]["embedding"]

    await redis.set(key, json.dumps(embedding))
    return {"embedding": embedding}
