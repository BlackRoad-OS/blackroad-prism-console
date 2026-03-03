from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

import yaml

from datetime import datetime
from .context import EvaluationContext
from .rule import Rule


@dataclass
class RuleTestCase:
    name: str
    want: bool
    input: Optional[Dict[str, Any]] = None
    series: Optional[List[Dict[str, Any]]] = None
    window: Optional[str] = None
    baseline: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    now: Optional[str] = None
    fixture: Optional[str] = None
    expect_details: Optional[Dict[str, Any]] = None
    expect_error: Optional[str] = None


def _expand_series(series: List[Any]) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    for item in series:
        if isinstance(item, Mapping) and "repeat" in item:
            count = int(item["repeat"])
            template = item.get("each", {}) if isinstance(item.get("each"), Mapping) else {}
            for _ in range(count):
                events.append(dict(template))
        else:
            events.append(dict(item))
    return events


def load_fixture(path: Path) -> Dict[str, Any]:
    data = json.loads(path.read_text())
    if isinstance(data, list):
        return {"series": data}
    if not isinstance(data, Mapping):
        raise TypeError(f"Fixture must be an object or array: {path}")
    return dict(data)


def load_rule_file(path: str | Path) -> tuple[Rule, List[RuleTestCase]]:
    rule_path = Path(path)
    payload = yaml.safe_load(rule_path.read_text())
    rule = Rule.from_dict(payload)

    tests: List[RuleTestCase] = []
    for entry in payload.get("tests", []):
        raw_want = entry.get("want")
        if isinstance(raw_want, dict):
            want = raw_want.get("decision", "deny") == "deny"
        else:
            want = bool(raw_want)
        tc = RuleTestCase(
            name=entry["name"],
            want=want,
            input=dict(entry.get("input", {})),
            window=entry.get("window"),
            baseline=dict(entry.get("baseline", {})),
            metadata=dict(entry.get("metadata", {})),
            now=entry.get("now"),
            fixture=entry.get("fixture"),
            expect_details=entry.get("expect_details"),
            expect_error=entry.get("expect_error"),
        )
        if "series" in entry:
            tc.series = _expand_series(entry["series"])
        tests.append(tc)
    return rule, tests


def build_context(test_case: RuleTestCase) -> EvaluationContext:
    series = test_case.series or []
    now_value = None
    if test_case.now:
        text = test_case.now
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        now_value = datetime.fromisoformat(text)
    return EvaluationContext(
        series=series,
        baseline=test_case.baseline,
        metadata=test_case.metadata,
        extras={},
        now_value=now_value,
    )

