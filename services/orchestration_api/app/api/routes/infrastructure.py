"""Infrastructure management endpoints."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from ...schemas.infrastructure import (
    AlertConfig,
    CleanupRequest,
    CleanupResponse,
    DeploymentDetail,
    DeploymentListItem,
    DeploymentState,
    DeployRequest,
    DropletDetail,
    DropletListItem,
    DropletState,
    DropletStatus,
    InfraMetrics,
    RepairRequest,
    RepairResponse,
)

router = APIRouter()


class _InfraStore:
    """In-memory store for infrastructure state."""

    def __init__(self) -> None:
        self._droplets: Dict[str, DropletDetail] = {}
        self._deployments: Dict[str, DeploymentDetail] = {}
        self._repairs: Dict[str, RepairResponse] = {}
        self._cleanups: Dict[str, CleanupResponse] = {}
        self._alert_config = AlertConfig()
        self._seed_data()

    def _seed_data(self) -> None:
        """Initialize with sample droplet data."""
        now = datetime.utcnow()
        sample_droplets = [
            ("do-nyc1-prod-01", "159.65.123.159", "nyc1"),
            ("do-sfo1-staging-01", "134.209.45.78", "sfo1"),
            ("do-ams3-dev-01", "164.92.89.123", "ams3"),
        ]

        for name, ip, region in sample_droplets:
            droplet_id = name
            self._droplets[droplet_id] = DropletDetail(
                id=droplet_id,
                name=name,
                ip_address=ip,
                region=region,
                state=DropletState.HEALTHY,
                disk_usage_percent=45.0,
                memory_usage_percent=62.0,
                cpu_usage_percent=23.0,
                uptime_seconds=864000,
                last_check=now,
                tags=["blackroad", region],
            )

    def list_droplets(self) -> List[DropletListItem]:
        return [
            DropletListItem(
                id=d.id,
                name=d.name,
                ip_address=d.ip_address,
                region=d.region,
                state=d.state,
                disk_usage_percent=d.disk_usage_percent,
                last_check=d.last_check,
            )
            for d in self._droplets.values()
        ]

    def get_droplet(self, droplet_id: str) -> DropletDetail:
        if droplet_id not in self._droplets:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "droplet_not_found", "droplet_id": droplet_id},
            )
        return self._droplets[droplet_id]

    def get_droplet_status(self, droplet_id: str) -> DropletStatus:
        droplet = self.get_droplet(droplet_id)
        checks = {
            "ssh_accessible": droplet.state != DropletState.OFFLINE,
            "disk_ok": droplet.disk_usage_percent < 90,
            "services_running": droplet.state == DropletState.HEALTHY,
        }
        issues = []
        if not checks["disk_ok"]:
            issues.append("Disk usage above 90%")
        if not checks["ssh_accessible"]:
            issues.append("SSH connection failed")

        return DropletStatus(
            droplet_id=droplet_id,
            state=droplet.state,
            checks=checks,
            issues=issues,
            last_check=datetime.utcnow(),
        )

    def initiate_repair(
        self, droplet_id: str, request: RepairRequest
    ) -> RepairResponse:
        self.get_droplet(droplet_id)
        repair_id = str(uuid4())
        now = datetime.utcnow()

        response = RepairResponse(
            repair_id=repair_id,
            droplet_id=droplet_id,
            state="initiated",
            actions_queued=request.actions,
            started_at=now,
            estimated_duration_seconds=len(request.actions) * 60,
        )
        self._repairs[repair_id] = response
        return response

    def initiate_cleanup(self, request: CleanupRequest) -> CleanupResponse:
        cleanup_id = str(uuid4())
        now = datetime.utcnow()

        target_count = len(request.target_droplets or self._droplets)
        response = CleanupResponse(
            cleanup_id=cleanup_id,
            droplets_affected=target_count,
            space_freed_mb=target_count * 512.0,
            started_at=now,
        )
        self._cleanups[cleanup_id] = response
        return response

    def list_deployments(self) -> List[DeploymentListItem]:
        return [
            DeploymentListItem(
                id=d.id,
                service_name=d.service_name,
                version=d.version,
                state=d.state,
                started_at=d.started_at,
                completed_at=d.completed_at,
            )
            for d in self._deployments.values()
        ]

    def create_deployment(self, request: DeployRequest) -> DeploymentDetail:
        deployment_id = str(uuid4())
        now = datetime.utcnow()

        targets = request.target_droplets or list(self._droplets.keys())

        deployment = DeploymentDetail(
            id=deployment_id,
            service_name=request.service_name,
            version=request.version,
            state=DeploymentState.PENDING,
            target_droplets=targets,
            config=request.config,
            started_at=now,
            deployed_by="api",
        )
        self._deployments[deployment_id] = deployment
        return deployment

    def get_metrics(self) -> InfraMetrics:
        droplets = list(self._droplets.values())
        total = len(droplets)
        healthy = sum(1 for d in droplets if d.state == DropletState.HEALTHY)
        degraded = sum(1 for d in droplets if d.state == DropletState.DEGRADED)
        unhealthy = total - healthy - degraded

        return InfraMetrics(
            timestamp=datetime.utcnow(),
            total_droplets=total,
            healthy_count=healthy,
            degraded_count=degraded,
            unhealthy_count=unhealthy,
            avg_disk_usage=sum(d.disk_usage_percent for d in droplets) / max(total, 1),
            avg_memory_usage=sum(d.memory_usage_percent for d in droplets)
            / max(total, 1),
            avg_cpu_usage=sum(d.cpu_usage_percent for d in droplets) / max(total, 1),
            active_deployments=sum(
                1 for d in self._deployments.values() if d.state == DeploymentState.RUNNING
            ),
            pending_repairs=sum(
                1 for r in self._repairs.values() if r.state == "initiated"
            ),
            alerts_active=0,
        )

    def configure_alerts(self, config: AlertConfig) -> AlertConfig:
        self._alert_config = config
        return self._alert_config


_store = _InfraStore()


@router.get("/droplets", response_model=List[DropletListItem])
async def list_droplets() -> List[DropletListItem]:
    """List managed droplets."""
    return _store.list_droplets()


@router.get("/droplets/{droplet_id}", response_model=DropletDetail)
async def get_droplet(droplet_id: str) -> DropletDetail:
    """Get droplet details."""
    return _store.get_droplet(droplet_id)


@router.get("/droplets/{droplet_id}/status", response_model=DropletStatus)
async def get_droplet_status(droplet_id: str) -> DropletStatus:
    """Get droplet health status."""
    return _store.get_droplet_status(droplet_id)


@router.post(
    "/droplets/{droplet_id}/repair",
    response_model=RepairResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def repair_droplet(droplet_id: str, request: RepairRequest) -> RepairResponse:
    """Trigger droplet repair."""
    return _store.initiate_repair(droplet_id, request)


@router.post(
    "/cleanup", response_model=CleanupResponse, status_code=status.HTTP_202_ACCEPTED
)
async def cleanup_infrastructure(request: CleanupRequest) -> CleanupResponse:
    """Trigger disk cleanup across infrastructure."""
    return _store.initiate_cleanup(request)


@router.get("/deployments", response_model=List[DeploymentListItem])
async def list_deployments() -> List[DeploymentListItem]:
    """List active deployments."""
    return _store.list_deployments()


@router.post(
    "/deploy", response_model=DeploymentDetail, status_code=status.HTTP_202_ACCEPTED
)
async def create_deployment(request: DeployRequest) -> DeploymentDetail:
    """Trigger new deployment."""
    return _store.create_deployment(request)


@router.get("/metrics", response_model=InfraMetrics)
async def get_infrastructure_metrics() -> InfraMetrics:
    """Get infrastructure metrics."""
    return _store.get_metrics()


@router.post("/alerts/configure", response_model=AlertConfig)
async def configure_alerts(config: AlertConfig) -> AlertConfig:
    """Configure alert thresholds."""
    return _store.configure_alerts(config)
