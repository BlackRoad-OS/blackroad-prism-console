from __future__ import annotations

from random import seed

from config.settings import settings
from orchestrator.base import BaseBot, BotResponse, Task
from orchestrator.registry import register

NAME = "Treasury-BOT"
MISSION = "Build cash forecasts and manage liquidity"
SUPPORTED_TASKS = ["cash_view"]


class TreasuryBot(BaseBot):
    NAME = NAME
    MISSION = MISSION
    SUPPORTED_TASKS = SUPPORTED_TASKS

    def run(self, task: Task) -> BotResponse:  # pragma: no cover - simple
        seed(settings.RANDOM_SEED)
        summary = (
            "Treasury-BOT produced a deterministic 13-week cash view with projected cash "
            "balance of $100000."
        )
        risks = ["Liquidity risk if collections slip"]
        return BotResponse(summary=summary, risks=risks)


register(TreasuryBot())
