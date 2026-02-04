"""Bot registry management endpoints."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, status

from ...schemas.bots import (
    BotConfig,
    BotDetail,
    BotListItem,
    BotLogs,
    BotRegisterRequest,
    BotState,
    BotTriggerRequest,
    BotTriggerResponse,
    BotType,
    LogEntry,
)

router = APIRouter()

BOTS_DIR = Path(__file__).parent.parent.parent.parent.parent.parent.parent / "bots"
AGENTS_DIR = Path(__file__).parent.parent.parent.parent.parent.parent.parent / "agents"


class _BotRegistry:
    """In-memory registry for bots."""

    def __init__(self) -> None:
        self._bots: Dict[str, BotDetail] = {}
        self._logs: Dict[str, List[LogEntry]] = {}
        self._discover_bots()

    def _classify_bot(self, name: str) -> BotType:
        """Determine bot type from name."""
        name_lower = name.lower()
        if "github" in name_lower or "comment" in name_lower or "issue" in name_lower:
            return BotType.GITHUB
        if "slack" in name_lower:
            return BotType.SLACK
        if "discord" in name_lower:
            return BotType.DISCORD
        if "webhook" in name_lower:
            return BotType.WEBHOOK
        if "cron" in name_lower or "schedule" in name_lower:
            return BotType.SCHEDULED
        return BotType.EVENT

    def _discover_bots(self) -> None:
        """Scan directories and register discovered bots."""
        for search_dir in [BOTS_DIR, AGENTS_DIR]:
            if not search_dir.exists():
                continue

            for item in search_dir.iterdir():
                if item.suffix == ".py" and "bot" in item.stem.lower():
                    bot_id = item.stem
                    if bot_id in self._bots:
                        continue

                    self._bots[bot_id] = BotDetail(
                        id=bot_id,
                        name=bot_id.replace("_", " ").title(),
                        description=f"Automated bot: {bot_id}",
                        bot_type=self._classify_bot(bot_id),
                        state=BotState.ACTIVE,
                        config=BotConfig(),
                        file_path=str(item),
                        entry_point="run",
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    )
                    self._logs[bot_id] = []

    def list(self) -> List[BotListItem]:
        return [
            BotListItem(
                id=b.id,
                name=b.name,
                bot_type=b.bot_type,
                state=b.state,
                trigger_count=b.trigger_count,
                last_triggered=b.last_triggered,
            )
            for b in self._bots.values()
        ]

    def get(self, bot_id: str) -> BotDetail:
        if bot_id not in self._bots:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "bot_not_found", "bot_id": bot_id},
            )
        return self._bots[bot_id]

    def register(self, request: BotRegisterRequest) -> BotDetail:
        bot_id = request.name.lower().replace(" ", "_")
        if bot_id in self._bots:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"error": "bot_already_exists", "bot_id": bot_id},
            )

        now = datetime.utcnow()
        bot = BotDetail(
            id=bot_id,
            name=request.name,
            description=request.description,
            bot_type=request.bot_type,
            state=BotState.INACTIVE,
            config=request.config or BotConfig(),
            file_path=request.file_path,
            entry_point=request.entry_point,
            created_at=now,
            updated_at=now,
        )
        self._bots[bot_id] = bot
        self._logs[bot_id] = []
        return bot

    def trigger(self, bot_id: str, request: BotTriggerRequest) -> BotTriggerResponse:
        bot = self.get(bot_id)
        execution_id = str(uuid4())
        now = datetime.utcnow()

        bot.state = BotState.RUNNING
        bot.last_triggered = now
        bot.trigger_count += 1

        self._logs[bot_id].append(
            LogEntry(
                timestamp=now,
                level="info",
                message=f"Bot triggered: {request.event_type or 'manual'}",
                metadata={"execution_id": execution_id, "payload": request.payload},
            )
        )

        return BotTriggerResponse(
            execution_id=execution_id,
            bot_id=bot_id,
            state=bot.state,
            queued_at=now,
        )

    def update_config(self, bot_id: str, config: BotConfig) -> BotDetail:
        bot = self.get(bot_id)
        bot.config = config
        bot.updated_at = datetime.utcnow()
        return bot

    def get_logs(
        self,
        bot_id: str,
        from_ts: Optional[datetime] = None,
        to_ts: Optional[datetime] = None,
        limit: int = 100,
    ) -> BotLogs:
        self.get(bot_id)
        all_logs = self._logs.get(bot_id, [])

        filtered = all_logs
        if from_ts:
            filtered = [e for e in filtered if e.timestamp >= from_ts]
        if to_ts:
            filtered = [e for e in filtered if e.timestamp <= to_ts]

        return BotLogs(
            bot_id=bot_id,
            entries=filtered[-limit:],
            total_count=len(all_logs),
            from_timestamp=from_ts,
            to_timestamp=to_ts,
        )


_registry = _BotRegistry()


@router.get("", response_model=List[BotListItem])
async def list_bots() -> List[BotListItem]:
    """List all registered bots."""
    return _registry.list()


@router.get("/{bot_id}", response_model=BotDetail)
async def get_bot(bot_id: str) -> BotDetail:
    """Get bot details and configuration."""
    return _registry.get(bot_id)


@router.post("/register", response_model=BotDetail, status_code=status.HTTP_201_CREATED)
async def register_bot(request: BotRegisterRequest) -> BotDetail:
    """Register a new bot."""
    return _registry.register(request)


@router.post(
    "/{bot_id}/trigger",
    response_model=BotTriggerResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_bot(bot_id: str, request: BotTriggerRequest) -> BotTriggerResponse:
    """Trigger bot execution."""
    return _registry.trigger(bot_id, request)


@router.put("/{bot_id}/config", response_model=BotDetail)
async def update_bot_config(bot_id: str, config: BotConfig) -> BotDetail:
    """Update bot configuration."""
    return _registry.update_config(bot_id, config)


@router.get("/{bot_id}/logs", response_model=BotLogs)
async def get_bot_logs(
    bot_id: str,
    from_timestamp: Optional[datetime] = Query(None),
    to_timestamp: Optional[datetime] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
) -> BotLogs:
    """Get bot execution logs."""
    return _registry.get_logs(bot_id, from_timestamp, to_timestamp, limit)
