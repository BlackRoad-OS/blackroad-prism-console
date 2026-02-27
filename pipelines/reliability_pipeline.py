from pathlib import Path
import csv
from typing import Dict

import settings
from dq import checks

BASE = Path("artifacts/pipelines/reliability")


def _read(path: Path):
    with path.open() as f:
        return list(csv.DictReader(f))


def run(inputs: Dict | None = None) -> Dict:
    inputs = inputs or {}
    sample_base = Path(inputs.get("sample_dir", "samples/generated/ops"))
    incidents = _read(sample_base / "incidents.csv")
    changes = _read(sample_base / "changes.csv")

    burn_rate = len(incidents) / max(len(changes), 1)
    risk_flag = burn_rate > 1

    summary = {
        "incidents": len(incidents),
        "changes": len(changes),
        "burn_rate": burn_rate,
        "risk_flag": risk_flag,
    }

    if settings.STRICT_DQ:
        mv = checks.check_missing_values(incidents + changes)
        sc = checks.check_schema(
            [summary],
            {
                "incidents": int,
                "changes": int,
                "burn_rate": float,
                "risk_flag": bool,
            },
        )
        if mv or sc:
            raise ValueError("DQ failure")

    BASE.mkdir(parents=True, exist_ok=True)
    out_path = BASE / "summary.json"
    import json

    with out_path.open("w") as f:
        json.dump(summary, f, indent=2)

    return {"output": str(out_path), **summary}


if __name__ == "__main__":
    print(run())
