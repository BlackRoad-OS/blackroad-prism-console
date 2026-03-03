#!/usr/bin/env python3
"""Codex build orchestrator for BlackRoad.io.

This script provides a chat-friendly interface for executing common
end-to-end tasks in the BlackRoad deployment pipeline.  Each command is a
step toward the goal of pushing repository changes through GitHub,
connector jobs, working copy refreshes, and droplet deployments.

The current implementation focuses on scaffolding.  Networking calls to
external services (Slack, Salesforce, Airtable, etc.) are left as
placeholders so the pipeline can be extended incrementally.
"""

from __future__ import annotations

import argparse
import shlex
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Iterable

LOG_FILE = Path("build.log")
ERROR_LOG_FILE = Path("build_errors.log")


def log(message: str) -> None:
    """Log a message to stdout and the build log."""
    print(message)
    with LOG_FILE.open("a", encoding="utf-8") as fh:
        fh.write(message + "\n")


def log_error(message: str) -> None:
    """Log an error message to stdout and the error log."""
    print(message)
    with ERROR_LOG_FILE.open("a", encoding="utf-8") as fh:
        fh.write(message + "\n")


def run(cmd: str, cwd: Path | None = None, dry_run: bool = False) -> tuple[int, str]:
    """Run a shell command, logging output and returning (code, output).

    Parameters
    ----------
    cmd:
        Command to execute.
    cwd:
        Working directory for the command.
    dry_run:
        If ``True`` the command is printed but not executed; returns (0, "").
    """
    log(f"$ {cmd}")
    if dry_run:
        return 0, ""
    result = subprocess.run(
        shlex.split(cmd),
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    output = result.stdout.strip()
    if output:
        log(output)
    if result.returncode != 0:
        log_error(f"Command '{cmd}' failed with exit code {result.returncode}")
        if output:
            log_error(output)
    return result.returncode, output


# ---------------------------------------------------------------------------
# GitHub / repo operations
# ---------------------------------------------------------------------------

AUTO_COMMIT_MESSAGE = "Automated commit by codex"


def push_to_github(branch: str = "main") -> None:
    """Commit local changes and push to GitHub."""
    try:
        code, _ = run("git add .")
        if code != 0:
            raise RuntimeError("git add failed")

        code, status = run("git status --porcelain")
        if code != 0:
            raise RuntimeError("git status failed")

        if status.strip():
            code, _ = run(f'git commit -m "{AUTO_COMMIT_MESSAGE}"')
            if code != 0:
                raise RuntimeError("git commit failed")
        else:
            log("No changes to commit.")

        code, _ = run(f"git push origin {branch}")
        if code != 0:
            raise RuntimeError("git push failed")
    except RuntimeError as err:
        log_error(str(err))
        raise


def pull_from_github(branch: str = "main") -> None:
    """Fetch and pull from GitHub, detecting merge conflicts."""
    try:
        code, _ = run("git fetch")
        if code != 0:
            raise RuntimeError("git fetch failed")

        code, _ = run(f"git pull --no-rebase origin {branch}")
        _, conflicts = run("git ls-files -u")
        if conflicts.strip():
            log_error("Merge conflicts detected:")
            log_error(conflicts)
            raise RuntimeError("Unresolved merge conflicts")
        if code != 0:
            raise RuntimeError("git pull failed")
    except RuntimeError as err:
        log_error(str(err))
        raise

def push_latest(dry_run: bool = False) -> None:
    """Push local commits and trigger deployment."""
    run("git push", dry_run=dry_run)
    deploy_to_droplet(dry_run=dry_run)


def refresh_working_copy(dry_run: bool = False) -> None:
    """Pull the latest changes into the working copy."""
    run("git pull --ff-only", dry_run=dry_run)


def rebase_branch(branch: str = "main", dry_run: bool = False) -> None:
    """Rebase the current branch onto the specified branch."""
    code, _ = run(f"git fetch origin {branch}")
    if code != 0:
        raise RuntimeError("git fetch failed")
    code, _ = run(f"git rebase origin/{branch}")
    if code != 0:
        raise RuntimeError("git rebase failed")
    run(f"git fetch origin {branch}", dry_run=dry_run)
    run(f"git rebase origin/{branch}", dry_run=dry_run)


# ---------------------------------------------------------------------------
# Connector and deployment placeholders
# ---------------------------------------------------------------------------


def sync_connectors(dry_run: bool = False) -> None:
    """Synchronise external connectors (Salesforce, Airtable, etc.).

    This is a placeholder for OAuth setup and webhook processing.  Extend
    this function with project-specific connector logic as needed.
    """

    print("[connectors] TODO: implement OAuth and webhook logic")


def _log(message: str, logfile: Path) -> None:
    timestamp = datetime.utcnow().isoformat()
    logfile.parent.mkdir(parents=True, exist_ok=True)
    with logfile.open("a", encoding="utf-8") as fh:
        fh.write(f"{timestamp} {message}\n")


def deploy_to_droplet(dry_run: bool = False) -> None:
    """Deploy the latest code to the droplet."""

    deploy_log = Path("deploy.log")
    error_log = Path("deploy_errors.log")

    paths: Iterable[tuple[str, str]] = [
        ("var/www/blackroad/", "/var/www/blackroad/"),
        ("srv/blackroad-api/", "/srv/blackroad-api/"),
        ("srv/lucidia-llm/", "/srv/lucidia-llm/"),
        ("srv/lucidia-math/", "/srv/lucidia-math/"),
    ]

    try:
        _log("Starting deployment", deploy_log)
        for local, remote in paths:
            cmd = f"rsync -az {local} blackroad.io:{remote}"
            _log(f"Sync {local} -> {remote}", deploy_log)
            run(cmd, dry_run=dry_run)

        _log("Restarting services", deploy_log)
        run(
            "ssh blackroad.io sudo systemctl restart blackroad-api lucidia-llm lucidia-math",
            dry_run=dry_run,
        )
        run("ssh blackroad.io sudo systemctl reload nginx", dry_run=dry_run)
        _log("Deployment complete", deploy_log)
    except (subprocess.CalledProcessError, OSError) as exc:
        _log(f"Deployment failed: {exc}", error_log)
        raise


# ---------------------------------------------------------------------------
# Chat-first control surface
# ---------------------------------------------------------------------------


def handle_command(cmd: str, dry_run: bool = False) -> None:
    actions = {
        "push": lambda: push_latest(dry_run=dry_run),
        "pull": pull_from_github,
        "refresh": lambda: refresh_working_copy(dry_run=dry_run),
        "rebase": lambda: rebase_branch(dry_run=dry_run),
        "sync": lambda: sync_connectors(dry_run=dry_run),
    }
    action = actions.get(cmd)
    if action:
        action()
    else:
        print(f"Unknown command: {cmd}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Codex build pipeline")
    parser.add_argument("command", help="push|pull|refresh|rebase|sync")
    parser.add_argument(
        "branch",
        nargs="?",
        default="main",
        help="branch name for rebase (default: main)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print commands without executing",
    )
    args = parser.parse_args()

    if args.command == "rebase":
        rebase_branch(args.branch, dry_run=args.dry_run)
    else:
        handle_command(args.command, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
