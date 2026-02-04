"""Agent management endpoints."""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from ...schemas.agents import (
    AgentConfig,
    AgentDetail,
    AgentExecution,
    AgentExecutionHistory,
    AgentListItem,
    AgentState,
    AgentStatus,
    ExecuteRequest,
)

router = APIRouter()

AGENTS_DIR = Path(__file__).parent.parent.parent.parent.parent.parent.parent / "agents"


class _AgentRegistry:
    """In-memory registry for discovered agents."""

    def __init__(self) -> None:
        self._agents: Dict[str, AgentDetail] = {}
        self._executions: Dict[str, List[AgentExecution]] = {}
        self._discover_agents()

    def _discover_agents(self) -> None:
        """Scan agents directory and register discovered agents."""
        if not AGENTS_DIR.exists():
            return

        categories = {
            "deploy": ["deploy_bot", "deployment"],
            "cleanup": ["cleanup_bot", "droplet_repair"],
            "github": ["comment_bot", "issue_bot", "label_bot"],
            "orchestration": ["athena", "lucidia_codex"],
            "automation": ["asana_bot", "job_board"],
        }

        for item in AGENTS_DIR.iterdir():
            if item.suffix == ".py" and not item.name.startswith("_"):
                agent_id = item.stem
                category = "general"
                for cat, patterns in categories.items():
                    if any(p in agent_id for p in patterns):
                        category = cat
                        break

                self._agents[agent_id] = AgentDetail(
                    id=agent_id,
                    name=agent_id.replace("_", " ").title(),
                    description=f"Autonomous agent: {agent_id}",
                    category=category,
                    state=AgentState.IDLE,
                    config=AgentConfig(),
                    file_path=str(item),
                    entry_point="run",
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )
                self._executions[agent_id] = []

    def list(self) -> List[AgentListItem]:
        return [
            AgentListItem(
                id=a.id,
                name=a.name,
                description=a.description,
                category=a.category,
                state=a.state,
                last_run=a.last_run,
            )
            for a in self._agents.values()
        ]

    def get(self, agent_id: str) -> AgentDetail:
        if agent_id not in self._agents:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "agent_not_found", "agent_id": agent_id},
            )
        return self._agents[agent_id]

    def execute(self, agent_id: str, request: ExecuteRequest) -> AgentExecution:
        agent = self.get(agent_id)
        execution_id = str(uuid4())
        now = datetime.utcnow()

        execution = AgentExecution(
            execution_id=execution_id,
            agent_id=agent_id,
            state=AgentState.RUNNING,
            started_at=now,
            parameters=request.parameters,
        )

        agent.state = AgentState.RUNNING
        agent.last_run = now
        agent.total_runs += 1
        self._executions[agent_id].append(execution)

        return execution

    def get_status(self, agent_id: str) -> AgentStatus:
        agent = self.get(agent_id)
        executions = self._executions.get(agent_id, [])
        current_exec = None
        for ex in reversed(executions):
            if ex.state == AgentState.RUNNING:
                current_exec = ex.execution_id
                break

        return AgentStatus(
            agent_id=agent_id,
            state=agent.state,
            current_execution_id=current_exec,
            queue_depth=sum(1 for e in executions if e.state == AgentState.RUNNING),
            last_heartbeat=datetime.utcnow(),
        )

    def get_history(
        self, agent_id: str, page: int = 1, page_size: int = 20
    ) -> AgentExecutionHistory:
        self.get(agent_id)
        all_execs = self._executions.get(agent_id, [])
        total = len(all_execs)
        start = (page - 1) * page_size
        end = start + page_size

        return AgentExecutionHistory(
            agent_id=agent_id,
            executions=list(reversed(all_execs))[start:end],
            total_count=total,
            page=page,
            page_size=page_size,
        )

    def configure(self, agent_id: str, config: AgentConfig) -> AgentDetail:
        agent = self.get(agent_id)
        agent.config = config
        agent.updated_at = datetime.utcnow()
        return agent

    def cancel_execution(self, agent_id: str, execution_id: str) -> None:
        self.get(agent_id)
        executions = self._executions.get(agent_id, [])
        for ex in executions:
            if ex.execution_id == execution_id:
                if ex.state == AgentState.RUNNING:
                    ex.state = AgentState.CANCELLED
                    ex.completed_at = datetime.utcnow()
                return
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "execution_not_found", "execution_id": execution_id},
        )


_registry = _AgentRegistry()


@router.get("", response_model=List[AgentListItem])
async def list_agents() -> List[AgentListItem]:
    """List all available agents with metadata."""
    return _registry.list()


@router.get("/{agent_id}", response_model=AgentDetail)
async def get_agent(agent_id: str) -> AgentDetail:
    """Get specific agent details."""
    return _registry.get(agent_id)


@router.post(
    "/{agent_id}/execute",
    response_model=AgentExecution,
    status_code=status.HTTP_202_ACCEPTED,
)
async def execute_agent(agent_id: str, request: ExecuteRequest) -> AgentExecution:
    """Execute an agent with specified parameters."""
    return _registry.execute(agent_id, request)


@router.get("/{agent_id}/status", response_model=AgentStatus)
async def get_agent_status(agent_id: str) -> AgentStatus:
    """Get agent execution status."""
    return _registry.get_status(agent_id)


@router.get("/{agent_id}/history", response_model=AgentExecutionHistory)
async def get_agent_history(
    agent_id: str, page: int = 1, page_size: int = 20
) -> AgentExecutionHistory:
    """Get agent execution history."""
    return _registry.get_history(agent_id, page, page_size)


@router.post("/{agent_id}/configure", response_model=AgentDetail)
async def configure_agent(agent_id: str, config: AgentConfig) -> AgentDetail:
    """Update agent configuration."""
    return _registry.configure(agent_id, config)


@router.delete(
    "/{agent_id}/executions/{execution_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def cancel_execution(agent_id: str, execution_id: str) -> None:
    """Cancel or cleanup an execution."""
    _registry.cancel_execution(agent_id, execution_id)
