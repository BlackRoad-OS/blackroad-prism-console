"""Agent debug program for the BlackRoad Prism console.

This module exposes a command line interface that guides agents through a
consistent set of diagnostics so they can bootstrap the Prism environment
after an outage or a broken deployment.  It focuses on three pillars:

1.  Capturing environment details (tooling versions and availability).
2.  Validating the filesystem layout that agents expect.
3.  Running lightweight health checks such as Python import validation.

When invoked with ``--fix`` the program creates missing runtime directories
(``prism/logs`` and ``prism/contradictions``) so subsequent agents can start
logging immediately.  A machine readable report can be written via
``--report`` or printed to stdout with ``--json``.

The script intentionally avoids heavyweight validation (package installation,
network access, etc.) so it remains safe to run inside the automation
environment.  Every check records its outcome allowing downstream agents to
decide whether additional remediation is required.
"""

from __future__ import annotations

import argparse
import json
import platform
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional


REPO_ROOT = Path(__file__).resolve().parents[2]
PRISM_ROOT = REPO_ROOT / "prism"

# Ensure the repository root is importable for Python package checks.
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@dataclass
class CheckResult:
    """Represents the outcome of a diagnostic check."""

    name: str
    status: str
    detail: str
    data: Dict[str, object] = field(default_factory=dict)

    def as_dict(self) -> Dict[str, object]:
        return {
            "name": self.name,
            "status": self.status,
            "detail": self.detail,
            "data": self.data,
        }


def _run_command(command: Iterable[str]) -> CheckResult:
    """Run ``command`` returning a ``CheckResult`` with captured output."""

    cmd_list = list(command)
    display = " ".join(cmd_list)

    if shutil.which(cmd_list[0]) is None:
        return CheckResult(
            name=f"command:{cmd_list[0]}",
            status="missing",
            detail=f"Command '{cmd_list[0]}' is not available on PATH.",
        )

    try:
        completed = subprocess.run(
            cmd_list,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            encoding="utf-8",
        )
    except OSError as exc:  # pragma: no cover - defensive guard
        return CheckResult(
            name=f"command:{cmd_list[0]}",
            status="error",
            detail=f"Failed to run '{display}': {exc}",
        )

    output = (completed.stdout or "").strip() or (completed.stderr or "").strip()
    status = "ok" if completed.returncode == 0 else "error"
    detail = output if output else f"Command exited with {completed.returncode}."

    return CheckResult(
        name=f"command:{cmd_list[0]}",
        status=status,
        detail=detail,
        data={"returncode": completed.returncode, "command": cmd_list},
    )


def _check_python_import(module: str) -> CheckResult:
    """Verify that ``module`` can be imported without raising an exception."""

    try:
        __import__(module)
    except Exception as exc:  # pylint: disable=broad-except
        return CheckResult(
            name=f"import:{module}",
            status="error",
            detail=f"Import failed: {exc}",
        )

    return CheckResult(
        name=f"import:{module}",
        status="ok",
        detail="Module import succeeded.",
    )


def _check_path(path: Path, create: bool = False) -> CheckResult:
    """Ensure ``path`` exists, optionally creating directories."""

    if path.exists():
        return CheckResult(
            name=f"path:{path.relative_to(REPO_ROOT)}",
            status="ok",
            detail="Path exists.",
            data={"created": False},
        )

    if create:
        if path.suffix:
            # When a suffix is present we treat it as a file stub.
            path.parent.mkdir(parents=True, exist_ok=True)
            path.touch(exist_ok=True)
        else:
            path.mkdir(parents=True, exist_ok=True)

        return CheckResult(
            name=f"path:{path.relative_to(REPO_ROOT)}",
            status="created",
            detail="Path was missing and has been created.",
            data={"created": True},
        )

    return CheckResult(
        name=f"path:{path.relative_to(REPO_ROOT)}",
        status="missing",
        detail="Path is missing.",
        data={"created": False},
    )


def gather_environment_checks() -> List[CheckResult]:
    """Collect environment-level information (versions and platform)."""

    results: List[CheckResult] = []
    system_info = {
        "platform": platform.platform(),
        "python_executable": sys.executable,
    }
    results.append(
        CheckResult(
            name="environment:system",
            status="ok",
            detail="System information captured.",
            data=system_info,
        )
    )

    for command in (
        ("python3", "--version"),
        ("python", "--version"),
        ("node", "--version"),
        ("pnpm", "--version"),
        ("npm", "--version"),
        ("pip", "--version"),
    ):
        results.append(_run_command(command))

    return results


def gather_filesystem_checks(fix_paths: bool) -> List[CheckResult]:
    """Validate repository layout that runtime agents expect."""

    required_paths = [
        (PRISM_ROOT / "logs", True),
        (PRISM_ROOT / "contradictions", True),
        (PRISM_ROOT / "agents", False),
        (REPO_ROOT / "agents" / "debugger" / "manifest.json", False),
        (REPO_ROOT / "agents" / "debugger" / "index.js", False),
    ]

    return [_check_path(path, create=fix_paths and should_create) for path, should_create in required_paths]


def gather_python_checks() -> List[CheckResult]:
    """Run quick Python-centric health checks."""

    modules = ["prism", "agents", "agents.blackroad_agent_framework"]
    return [_check_python_import(module) for module in modules]


def summarize(results: Iterable[CheckResult]) -> Dict[str, object]:
    """Build a summary dictionary from individual check results."""

    total = 0
    issues = 0
    created = 0

    for result in results:
        total += 1
        if result.status not in {"ok", "created"}:
            issues += 1
        if result.status == "created":
            created += 1

    status = "ok" if issues == 0 else "attention"
    return {
        "status": status,
        "total_checks": total,
        "issues": issues,
        "paths_created": created,
    }


def run_diagnostics(fix_paths: bool = False) -> Dict[str, object]:
    """Execute all diagnostics returning a consolidated report."""

    categories = {
        "environment": gather_environment_checks(),
        "filesystem": gather_filesystem_checks(fix_paths),
        "python": gather_python_checks(),
    }

    flat_results = [result for results in categories.values() for result in results]
    report = {
        "summary": summarize(flat_results),
        "categories": {
            name: [result.as_dict() for result in results]
            for name, results in categories.items()
        },
    }
    return report


def _format_human(report: Dict[str, object]) -> str:
    """Render a human readable summary of ``report``."""

    lines = []
    summary = report.get("summary", {})
    lines.append("=== Prism Agent Debug Report ===")
    lines.append(
        "Status: {status} | Checks: {total_checks} | Issues: {issues} | Paths created: {paths_created}".format(
            status=summary.get("status", "unknown"),
            total_checks=summary.get("total_checks", "?"),
            issues=summary.get("issues", "?"),
            paths_created=summary.get("paths_created", 0),
        )
    )
    lines.append("")

    categories: Dict[str, List[Dict[str, object]]] = report.get("categories", {})  # type: ignore[assignment]
    for category, results in categories.items():
        lines.append(f"[{category}]")
        for result in results:
            detail = result.get("detail", "")
            lines.append(f"- {result['name']}: {result['status']} — {detail}")
        lines.append("")

    return "\n".join(lines).rstrip()


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    """Parse command line arguments."""

    parser = argparse.ArgumentParser(description="Run Prism agent diagnostics")
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Create missing runtime directories such as prism/logs.",
    )
    parser.add_argument(
        "--report",
        type=Path,
        help="Write the JSON report to the specified path.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print the JSON report to stdout (suppresses human summary).",
    )
    return parser.parse_args(list(argv) if argv is not None else None)


def main(argv: Optional[Iterable[str]] = None) -> int:
    """Entry point used by ``if __name__ == '__main__'`` and by tests."""

    args = parse_args(argv)
    report = run_diagnostics(fix_paths=args.fix)

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(_format_human(report))

    status = report.get("summary", {}).get("status")
    return 0 if status == "ok" else 1


if __name__ == "__main__":  # pragma: no cover - manual execution path
    sys.exit(main())
