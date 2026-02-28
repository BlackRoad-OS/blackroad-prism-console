"""Unit tests for the URGENT task priority level."""

from __future__ import annotations

from datetime import datetime
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, MutableMapping, Optional, Sequence

import pytest


# ---------------------------------------------------------------------------
# Inline-import of orchestrator.protocols to bypass pre-existing issues in
# other orchestrator submodules (unrelated to this change).  We verify the
# *actual* source file by exec-ing only the relevant definitions.
# ---------------------------------------------------------------------------

import importlib.util as _ilu
import types as _types
import pathlib as _pathlib
import sys as _sys

_proto_path = _pathlib.Path(__file__).resolve().parents[2] / "orchestrator" / "protocols.py"

# Read just the source and exec it in a fresh module namespace
_code = _proto_path.read_text()
_module = _types.ModuleType("orchestrator.protocols")
_module.__file__ = str(_proto_path)
# Register the module so dataclass internals can resolve it
_sys.modules["orchestrator.protocols"] = _module
exec(compile(_code, str(_proto_path), "exec"), _module.__dict__)  # noqa: S102

Task = _module.Task
TaskPriority = _module.TaskPriority


def test_urgent_priority_enum_value():
    assert TaskPriority.URGENT.value == "urgent"


def test_urgent_priority_in_enum_members():
    values = [p.value for p in TaskPriority]
    assert "urgent" in values


def test_task_with_urgent_priority():
    task = Task(
        id="TSK-URGENT-001",
        goal="Deploy workflows to all org repos immediately",
        owner="platform-engineering",
        priority=TaskPriority.URGENT,
        created_at=datetime.utcnow(),
        tags=("urgent", "deployment", "org-wide"),
    )
    assert task.priority == TaskPriority.URGENT
    assert task.to_dict()["priority"] == "urgent"


def test_task_urgent_priority_from_string():
    task = Task(
        id="TSK-URGENT-002",
        goal="Emergency indexing task",
        owner="ops",
        priority="urgent",
        created_at=datetime.utcnow(),
    )
    assert task.priority == TaskPriority.URGENT


def test_task_urgent_priority_case_insensitive():
    task = Task(
        id="TSK-URGENT-003",
        goal="Urgent E2E deployment",
        owner="ops",
        priority="URGENT",
        created_at=datetime.utcnow(),
    )
    assert task.priority == TaskPriority.URGENT


def test_task_serialization_round_trip_urgent():
    task = Task(
        id="TSK-URGENT-004",
        goal="Org-wide Stripe + Clerk E2E workflow rollout",
        owner="platform-engineering",
        priority=TaskPriority.URGENT,
        created_at=datetime(2026, 2, 28, 22, 55),
        tags=("urgent", "stripe", "clerk", "e2e"),
        metadata={"org": "BlackRoad-OS-Inc"},
    )
    d = task.to_dict()
    restored = Task(**d)
    assert restored.priority == TaskPriority.URGENT
    assert restored.id == task.id
    assert restored.goal == task.goal
    assert restored.metadata["org"] == "BlackRoad-OS-Inc"
