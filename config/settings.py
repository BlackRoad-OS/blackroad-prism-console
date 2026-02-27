"""Centralised runtime configuration for the console."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class Settings:
    """Basic settings container used across the console."""

    CACHE_TTL_SECONDS: int = 60
    CACHE_BACKEND: str = "memory"
    RANDOM_SEED: int = 1
    LOG_LEVEL: str = "INFO"


settings = Settings()
ENCRYPT_DATA_AT_REST = False
DATA_RETENTION_DAYS = 30
