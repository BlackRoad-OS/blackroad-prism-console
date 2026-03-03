#!/usr/bin/env python3
"""Unified CI/CD and connector control for BlackRoad.io."""
from __future__ import annotations

import argparse
import logging
import os
import subprocess
from typing import Callable

import requests
from fastapi import FastAPI, Request
import uvicorn

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)
SLACK_WEBHOOK = os.getenv("SLACK_WEBHOOK_URL")
MONITORING_URL = os.getenv("MONITORING_URL", "http://localhost:8000/logs")
SCRIPT_DIR = os.path.dirname(__file__)


def notify_slack(message: str) -> None:
    """Post a simple message to Slack if configured."""
    if not SLACK_WEBHOOK:
        return
    try:
        requests.post(SLACK_WEBHOOK, json={"text": message}, timeout=5)
    except Exception as exc:  # noqa: BLE001
        log.warning("slack notify failed: %s", exc)


def notify_monitor(status: str) -> None:
    """Send a status event to the monitoring API."""
    try:
        requests.post(MONITORING_URL, json={"status": status}, timeout=5)
    except Exception as exc:  # noqa: BLE001
        log.warning("monitor notify failed: %s", exc)


def run(cmd: list[str], **kwargs) -> None:
    """Run a subprocess command and stream output."""
    log.info("$ %s", " ".join(cmd))
    subprocess.run(cmd, check=True, **kwargs)


def create_snapshot() -> None:
    """Invoke the snapshot script."""
    snapshot = os.path.join(SCRIPT_DIR, "snapshot.sh")
    run(["bash", snapshot])


def push_latest() -> None:
    """Commit any changes, rebase, push, then deploy."""
    status = subprocess.run(
        ["git", "status", "--porcelain"], capture_output=True, text=True, check=True
    ).stdout
    if status.strip():
        run(["git", "add", "-A"])
        run(["git", "commit", "-m", "Codex auto-commit"])
    run(["git", "pull", "--rebase", "origin", "main"])
    run(["git", "push", "origin", "HEAD"])
    notify_slack(":rocket: pushed latest to GitHub")
    trigger_downstream()


def refresh_working_copy_and_redeploy() -> None:
    """Pull latest and redeploy the droplet."""
    run(["git", "pull", "--rebase", "origin", "main"])
    deploy_to_droplet()
    notify_slack(":arrows_counterclockwise: working copy refreshed")


def rebase_branch_and_update_site() -> None:
    """Rebase current branch onto main and redeploy."""
    run(["git", "fetch", "origin"])
    run(["git", "rebase", "origin/main"])
    run(["git", "push", "origin", "HEAD"])
    deploy_to_droplet()
    notify_slack(":recycle: branch rebased and site updated")


def sync_salesforce_airtable_droplet() -> None:
    """Stub connector workflow."""
    log.info("Sync Salesforce -> Airtable -> Droplet (stubbed)")
    notify_slack(":link: connectors synced (stub)")


def trigger_downstream() -> None:
    refresh_working_copy()
    deploy_to_droplet()


def refresh_working_copy() -> None:
    path = os.getenv("WORKING_COPY_PATH")
    if not path:
        log.info("WORKING_COPY_PATH not set; skipping iOS Working Copy refresh")
        return
    run(["git", "-C", path, "pull", "--rebase", "origin", "main"])


def deploy_to_droplet() -> None:
    script = os.path.join(SCRIPT_DIR, "prism_sync_build.sh")
    if not os.path.exists(script):
        log.warning("deploy script missing: %s", script)
        return
    try:
        run(["bash", script])
        notify_monitor("deploy-success")
    except subprocess.CalledProcessError as exc:
        log.error("deploy failed: %s", exc)
        rollback = os.path.join(SCRIPT_DIR, "rollback.sh")
        subprocess.run(["bash", rollback, "latest"], check=False)
        notify_monitor("deploy-rollback")
        raise


def launch_connector_server() -> None:
    """Start a tiny FastAPI app with OAuth/webhook placeholders."""
    app = FastAPI(title="BlackRoad Connectors")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/oauth/callback")
    async def oauth_callback(code: str) -> dict[str, str]:
        log.info("OAuth callback code=%s", code)
        return {"ok": "callback received"}

    @app.post("/webhooks/salesforce")
    async def salesforce_webhook(request: Request) -> dict[str, str]:
        log.info("Salesforce webhook payload: %s", await request.json())
        return {"received": "salesforce"}

    @app.post("/webhooks/airtable")
    async def airtable_webhook(request: Request) -> dict[str, str]:
        log.info("Airtable webhook payload: %s", await request.json())
        return {"received": "airtable"}

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("WEBHOOK_PORT", "8040")))


COMMANDS: dict[str, Callable[[], None]] = {
    "push-latest": push_latest,
    "refresh": refresh_working_copy_and_redeploy,
    "rebase-update": rebase_branch_and_update_site,
    "sync-connectors": sync_salesforce_airtable_droplet,
    "webhook-server": launch_connector_server,
}


def parse_command(raw: str) -> Callable[[], None]:
    raw = raw.lower()
    if "push" in raw and "latest" in raw:
        return push_latest
    if "refresh" in raw:
        return refresh_working_copy_and_redeploy
    if "rebase" in raw or "update" in raw:
        return rebase_branch_and_update_site
    if "salesforce" in raw or "airtable" in raw:
        return sync_salesforce_airtable_droplet
    if "webhook" in raw or "server" in raw:
        return launch_connector_server
    return lambda: log.error("unknown command: %s", raw)


def main() -> None:
    parser = argparse.ArgumentParser(description="Codex CI/CD control surface")
    parser.add_argument("command", help="Free-form command like 'Push latest to BlackRoad.io'")
    parser.add_argument("--snapshot", action="store_true", help="Create snapshot before running command")
    args = parser.parse_args()
    if args.snapshot:
        create_snapshot()
    func = parse_command(args.command)
    func()


if __name__ == "__main__":
    main()
