"""Configuration management for LLM service."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """LLM service configuration."""

    model_config = SettingsConfigDict(env_prefix="LLM_", env_file=".env", extra="ignore")

    # Service configuration
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"
    workers: int = 1

    # Default provider
    default_provider: Literal["openai", "anthropic", "vllm", "ollama", "echo"] = "ollama"

    # OpenAI configuration
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_default_model: str = "gpt-4o-mini"
    openai_timeout: int = 60

    # Anthropic configuration
    anthropic_api_key: str | None = None
    anthropic_base_url: str = "https://api.anthropic.com"
    anthropic_default_model: str = "claude-sonnet-4-5-20250929"
    anthropic_timeout: int = 60

    # vLLM configuration
    vllm_enabled: bool = False
    vllm_model: str = "meta-llama/Meta-Llama-3-8B-Instruct"
    vllm_gpu_memory_utilization: float = 0.9
    vllm_max_model_len: int = 4096
    vllm_tensor_parallel_size: int = 1

    # Ollama configuration
    ollama_base_url: str = "http://localhost:11434"
    ollama_default_model: str = "llama3.1"
    ollama_timeout: int = 120

    # Caching
    redis_url: str | None = None
    cache_ttl: int = 3600  # 1 hour
    cache_enabled: bool = False

    # Rate limiting
    rate_limit_enabled: bool = True
    rate_limit_requests_per_minute: int = 60
    rate_limit_tokens_per_minute: int = 100000

    # Observability
    metrics_enabled: bool = True
    metrics_port: int = 9090
    tracing_enabled: bool = False
    tracing_endpoint: str | None = None

    # Model preloading
    preload_models: list[str] = Field(default_factory=list)

    # Request defaults
    default_max_tokens: int = 1024
    default_temperature: float = 0.7
    default_top_p: float = 1.0

    # Security
    require_auth: bool = False
    api_keys: list[str] = Field(default_factory=list)


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
