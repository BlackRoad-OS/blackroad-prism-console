"""Pydantic schemas for agent management."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AgentState(str, Enum):
    """Execution state of an agent."""

    IDLE = "idle"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AgentListItem(BaseModel):
    """Summary view of an agent for list responses."""

    id: str = Field(..., description="Unique agent identifier")
    name: str = Field(..., description="Human-readable agent name")
    description: str = Field(..., description="Brief description of agent purpose")
    category: str = Field(..., description="Agent category (e.g., deploy, cleanup)")
    state: AgentState = Field(default=AgentState.IDLE)
    last_run: Optional[datetime] = Field(None, description="Last execution timestamp")


class AgentConfig(BaseModel):
    """Configuration parameters for an agent."""

    timeout_seconds: int = Field(default=300, ge=1, le=3600)
    retry_count: int = Field(default=3, ge=0, le=10)
    environment: Dict[str, str] = Field(default_factory=dict)
    parameters: Dict[str, Any] = Field(default_factory=dict)


class AgentDetail(BaseModel):
    """Full agent details including configuration."""

    id: str
    name: str
    description: str
    category: str
    state: AgentState
    config: AgentConfig
    file_path: str = Field(..., description="Path to agent source file")
    entry_point: str = Field(default="run", description="Entry function name")
    created_at: datetime
    updated_at: datetime
    last_run: Optional[datetime] = None
    total_runs: int = Field(default=0)
    success_rate: float = Field(default=0.0, ge=0.0, le=1.0)


class ExecuteRequest(BaseModel):
    """Request payload for agent execution."""

    parameters: Dict[str, Any] = Field(default_factory=dict)
    async_mode: bool = Field(default=True, description="Run asynchronously")
    timeout_seconds: Optional[int] = Field(None, ge=1, le=3600)
    callback_url: Optional[str] = Field(None, description="Webhook for completion")


class AgentExecution(BaseModel):
    """Details of a single agent execution."""

    execution_id: str
    agent_id: str
    state: AgentState
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    exit_code: Optional[int] = None
    output: Optional[str] = None
    error: Optional[str] = None
    parameters: Dict[str, Any] = Field(default_factory=dict)


class AgentStatus(BaseModel):
    """Current status of an agent."""

    agent_id: str
    state: AgentState
    current_execution_id: Optional[str] = None
    queue_depth: int = Field(default=0)
    last_heartbeat: Optional[datetime] = None


class AgentExecutionHistory(BaseModel):
    """Paginated execution history for an agent."""

    agent_id: str
    executions: List[AgentExecution]
    total_count: int
    page: int = Field(default=1)
    page_size: int = Field(default=20)
