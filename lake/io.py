import json
from pathlib import Path
from typing import Any, Dict

SCHEMA_DIR = Path(__file__).resolve().parents[1] / "contracts" / "schemas"
LAKE_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "lake"


def _load_schema(name: str) -> Dict[str, Any]:
    schema_path = SCHEMA_DIR / f"{name}.json"
    if not schema_path.exists():
        return {}
    with open(schema_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _validate(data: Dict[str, Any], schema: Dict[str, Any]) -> None:
    required = schema.get("required", [])
    props = schema.get("properties", {})
    for key in required:
        if key not in data:
            raise ValueError(f"missing required field: {key}")
    for key, val in data.items():
        if key in props:
            t = props[key].get("type")
            if t == "number" and not isinstance(val, (int, float)):
                raise ValueError(f"{key} must be number")
            if t == "string" and not isinstance(val, str):
                raise ValueError(f"{key} must be string")


def write(table: str, record: Dict[str, Any]) -> None:
    schema = _load_schema(table)
    if schema:
        _validate(record, schema)
    dest = LAKE_DIR / f"{table}.jsonl"
    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")
