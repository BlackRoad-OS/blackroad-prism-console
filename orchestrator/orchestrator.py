from __future__ import annotations

import json
import uuid
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List

from dataclasses import dataclass as _dataclass
from typing import Any as _Any


@_dataclass
class Response:
    """Simple response object returned by the Orchestrator."""
    task_id: str
    status: str
    data: _Any = ""


@_dataclass
class Task:
    """Simple task used by the Orchestrator router."""
    id: str
    description: str
    domain: str
    metadata: dict = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}



class Orchestrator:
    """Routes tasks to registered bots and logs all actions."""

    def __init__(
        self,
        memory_path: str | Path = "memory.jsonl",
        state_path: str | Path | None = None,
    ) -> None:
        self.bots: Dict[str, Any] = {}
        self.tasks: Dict[str, Task] = {}
        self.responses: Dict[str, Response] = {}
        self.memory_path = Path(memory_path)
        self.state_path = Path(state_path) if state_path else self.memory_path.with_suffix(".state.json")
        self._load_state()

    # Bot management -------------------------------------------------
    def register_bot(self, domain: str, bot: Any) -> None:
        self.bots[domain] = bot

    # Task lifecycle -------------------------------------------------
    def create_task(self, description: str, domain: str, metadata: Dict[str, Any] | None = None) -> Task:
        task = Task(id=str(uuid.uuid4()), description=description, domain=domain, metadata=metadata or {})
        if task.metadata.get("allow_network"):
            raise ValueError("Network calls are disallowed by guardrails")
        self.tasks[task.id] = task
        self._log({"event": "task_created", "task": asdict(task)})
        self._persist_state()
        return task

    def route(self, task_id: str) -> Response:
        task = self.tasks[task_id]
        bot = self.bots.get(task.domain)
        if not bot:
            response = Response(task_id=task.id, status="error", data=f"No bot for domain {task.domain}")
        else:
            response = bot.run(task)
        self.responses[task.id] = response
        self._log({"event": "task_routed", "task_id": task.id, "response": asdict(response)})
        self._persist_state()
        return response

    def list_tasks(self) -> List[Task]:
        return list(self.tasks.values())

    def get_status(self, task_id: str) -> Response | None:
        return self.responses.get(task_id)

    # Internal logging -----------------------------------------------
    def _log(self, record: Dict[str, Any]) -> None:
        self.memory_path.parent.mkdir(parents=True, exist_ok=True)
        with self.memory_path.open("a") as fh:
            fh.write(json.dumps(record) + "\n")

    def _load_state(self) -> None:
        if not self.state_path.exists():
            return

        data = json.loads(self.state_path.read_text())
        tasks = data.get("tasks", {})
        responses = data.get("responses", {})

        for task_id, payload in tasks.items():
            self.tasks[task_id] = Task(**payload)

        for task_id, payload in responses.items():
            self.responses[task_id] = Response(**payload)

    def _persist_state(self) -> None:
        state = {
            "tasks": {task_id: asdict(task) for task_id, task in self.tasks.items()},
            "responses": {task_id: asdict(response) for task_id, response in self.responses.items()},
        }

        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(json.dumps(state, indent=2, sort_keys=True, default=str))


def route(task, bot_name: str):
    """Module-level route function for backwards compatibility."""
    from bots import BOT_REGISTRY
    bot_cls = BOT_REGISTRY.get(bot_name)
    if not bot_cls:
        raise ValueError(f"Unknown bot: {bot_name}")
    bot = bot_cls() if callable(bot_cls) else bot_cls
    return bot.run(task)
