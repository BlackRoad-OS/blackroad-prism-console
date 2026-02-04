"""Pydantic schemas for infrastructure management."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class DropletState(str, Enum):
    """Health state of a droplet."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"
    OFFLINE = "offline"


class DeploymentState(str, Enum):
    """State of a deployment."""

    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"
    CANCELLED = "cancelled"


class DropletListItem(BaseModel):
    """Summary view of a droplet."""

    id: str = Field(..., description="DigitalOcean droplet ID")
    name: str
    ip_address: str
    region: str
    state: DropletState
    disk_usage_percent: float = Field(ge=0, le=100)
    last_check: Optional[datetime] = None


class DropletDetail(BaseModel):
    """Full droplet details."""

    id: str
    name: str
    ip_address: str
    region: str
    state: DropletState
    disk_usage_percent: float
    memory_usage_percent: float = Field(ge=0, le=100)
    cpu_usage_percent: float = Field(ge=0, le=100)
    uptime_seconds: int = Field(ge=0)
    last_repair: Optional[datetime] = None
    last_check: datetime
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class DropletStatus(BaseModel):
    """Current status and health of a droplet."""

    droplet_id: str
    state: DropletState
    checks: Dict[str, bool] = Field(
        default_factory=lambda: {
            "ssh_accessible": False,
            "disk_ok": False,
            "services_running": False,
        }
    )
    issues: List[str] = Field(default_factory=list)
    last_check: datetime


class RepairRequest(BaseModel):
    """Request payload for droplet repair."""

    actions: List[str] = Field(
        default_factory=lambda: ["free_disk", "restart_services"]
    )
    force: bool = Field(default=False)
    notify_on_complete: bool = Field(default=True)


class RepairResponse(BaseModel):
    """Response from droplet repair request."""

    repair_id: str
    droplet_id: str
    state: str = Field(default="initiated")
    actions_queued: List[str]
    started_at: datetime
    estimated_duration_seconds: int = Field(default=300)


class CleanupRequest(BaseModel):
    """Request payload for infrastructure cleanup."""

    target_droplets: Optional[List[str]] = Field(
        None, description="Specific droplets to clean, or all if None"
    )
    cleanup_logs: bool = Field(default=True)
    cleanup_cache: bool = Field(default=True)
    archive_before_delete: bool = Field(default=True)
    min_age_days: int = Field(default=7, ge=1)


class CleanupResponse(BaseModel):
    """Response from cleanup request."""

    cleanup_id: str
    droplets_affected: int
    space_freed_mb: float
    started_at: datetime
    completed_at: Optional[datetime] = None


class DeploymentListItem(BaseModel):
    """Summary view of a deployment."""

    id: str
    service_name: str
    version: str
    state: DeploymentState
    started_at: datetime
    completed_at: Optional[datetime] = None


class DeploymentDetail(BaseModel):
    """Full deployment details."""

    id: str
    service_name: str
    version: str
    state: DeploymentState
    target_droplets: List[str]
    config: Dict[str, Any] = Field(default_factory=dict)
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    logs_url: Optional[str] = None
    rollback_id: Optional[str] = None
    deployed_by: str = Field(default="system")


class DeployRequest(BaseModel):
    """Request payload for new deployment."""

    service_name: str = Field(..., min_length=1)
    version: str = Field(..., min_length=1)
    target_droplets: List[str] = Field(default_factory=list)
    config: Dict[str, Any] = Field(default_factory=dict)
    canary: bool = Field(default=False, description="Deploy to subset first")
    auto_rollback: bool = Field(default=True)


class InfraMetrics(BaseModel):
    """Aggregated infrastructure metrics."""

    timestamp: datetime
    total_droplets: int
    healthy_count: int
    degraded_count: int
    unhealthy_count: int
    avg_disk_usage: float
    avg_memory_usage: float
    avg_cpu_usage: float
    active_deployments: int
    pending_repairs: int
    alerts_active: int


class AlertConfig(BaseModel):
    """Alert threshold configuration."""

    disk_threshold_percent: int = Field(default=85, ge=0, le=100)
    memory_threshold_percent: int = Field(default=90, ge=0, le=100)
    cpu_threshold_percent: int = Field(default=95, ge=0, le=100)
    slack_webhook_url: Optional[str] = None
    email_recipients: List[str] = Field(default_factory=list)
    alert_cooldown_minutes: int = Field(default=30, ge=1)
