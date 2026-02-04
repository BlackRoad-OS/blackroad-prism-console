"""Pydantic schemas for bot registry management."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class BotType(str, Enum):
    """Type classification for bots."""

    GITHUB = "github"
    SLACK = "slack"
    DISCORD = "discord"
    WEBHOOK = "webhook"
    SCHEDULED = "scheduled"
    EVENT = "event"


class BotState(str, Enum):
    """Operational state of a bot."""

    ACTIVE = "active"
    INACTIVE = "inactive"
    RUNNING = "running"
    ERROR = "error"
    DISABLED = "disabled"


class BotListItem(BaseModel):
    """Summary view of a bot for list responses."""

    id: str = Field(..., description="Unique bot identifier")
    name: str = Field(..., description="Human-readable bot name")
    bot_type: BotType
    state: BotState = Field(default=BotState.INACTIVE)
    trigger_count: int = Field(default=0)
    last_triggered: Optional[datetime] = None


class BotConfig(BaseModel):
    """Configuration parameters for a bot."""

    enabled: bool = Field(default=True)
    trigger_events: List[str] = Field(default_factory=list)
    schedule_cron: Optional[str] = Field(None, description="Cron expression")
    webhook_url: Optional[str] = None
    retry_policy: Dict[str, Any] = Field(
        default_factory=lambda: {"max_retries": 3, "backoff_seconds": 2}
    )
    secrets: Dict[str, str] = Field(default_factory=dict)
    parameters: Dict[str, Any] = Field(default_factory=dict)


class BotDetail(BaseModel):
    """Full bot details including configuration."""

    id: str
    name: str
    description: str
    bot_type: BotType
    state: BotState
    config: BotConfig
    file_path: str = Field(..., description="Path to bot source file")
    entry_point: str = Field(default="run")
    created_at: datetime
    updated_at: datetime
    last_triggered: Optional[datetime] = None
    trigger_count: int = Field(default=0)
    success_count: int = Field(default=0)
    failure_count: int = Field(default=0)


class BotRegisterRequest(BaseModel):
    """Request payload for registering a new bot."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="")
    bot_type: BotType
    file_path: str
    entry_point: str = Field(default="run")
    config: Optional[BotConfig] = None


class BotTriggerRequest(BaseModel):
    """Request payload for triggering bot execution."""

    event_type: Optional[str] = Field(None, description="Event that triggered")
    payload: Dict[str, Any] = Field(default_factory=dict)
    force: bool = Field(default=False, description="Bypass rate limits")


class BotTriggerResponse(BaseModel):
    """Response from bot trigger request."""

    execution_id: str
    bot_id: str
    state: BotState
    queued_at: datetime
    estimated_start: Optional[datetime] = None


class LogEntry(BaseModel):
    """Single log entry from bot execution."""

    timestamp: datetime
    level: str = Field(..., description="Log level (info, warn, error)")
    message: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class BotLogs(BaseModel):
    """Paginated log entries for a bot."""

    bot_id: str
    entries: List[LogEntry]
    total_count: int
    from_timestamp: Optional[datetime] = None
    to_timestamp: Optional[datetime] = None
