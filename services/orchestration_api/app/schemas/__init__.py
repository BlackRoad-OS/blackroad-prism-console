"""Pydantic schemas for orchestration API serialization."""

from .agents import (
    AgentConfig,
    AgentDetail,
    AgentExecution,
    AgentExecutionHistory,
    AgentListItem,
    AgentStatus,
    ExecuteRequest,
)
from .bots import (
    BotConfig,
    BotDetail,
    BotListItem,
    BotLogs,
    BotRegisterRequest,
    BotTriggerRequest,
    BotTriggerResponse,
)
from .infrastructure import (
    AlertConfig,
    CleanupRequest,
    CleanupResponse,
    DeployRequest,
    DeploymentDetail,
    DeploymentListItem,
    DropletDetail,
    DropletListItem,
    DropletStatus,
    InfraMetrics,
    RepairRequest,
    RepairResponse,
)

__all__ = [
    # Agents
    "AgentConfig",
    "AgentDetail",
    "AgentExecution",
    "AgentExecutionHistory",
    "AgentListItem",
    "AgentStatus",
    "ExecuteRequest",
    # Bots
    "BotConfig",
    "BotDetail",
    "BotListItem",
    "BotLogs",
    "BotRegisterRequest",
    "BotTriggerRequest",
    "BotTriggerResponse",
    # Infrastructure
    "AlertConfig",
    "CleanupRequest",
    "CleanupResponse",
    "DeployRequest",
    "DeploymentDetail",
    "DeploymentListItem",
    "DropletDetail",
    "DropletListItem",
    "DropletStatus",
    "InfraMetrics",
    "RepairRequest",
    "RepairResponse",
]
