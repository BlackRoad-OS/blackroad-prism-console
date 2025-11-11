from __future__ import annotations

import os
from typing import Any

try:
    from redis.asyncio import Redis
except ImportError:  # pragma: no cover - optional dependency
    Redis = None  # type: ignore[assignment]

    async def get_redis() -> Any:
        raise RuntimeError(
            "The redis extra is required for embedding support. Install 'redis' to enable it."
        )

else:
    _redis: Redis | None = None

    async def get_redis() -> Redis:
        """Return a singleton Redis client."""

        global _redis
        if _redis is None:
            url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
            _redis = Redis.from_url(url)
        return _redis
