import os
import subprocess
from types import SimpleNamespace

import pytest


def _run(script: str, env: dict, args: list[str] | None = None) -> None:
    cmd = ["bash", script]
    if args:
        cmd.extend(args)
    subprocess.run(cmd, check=True, env=env)


def test_snapshot_and_rollback(tmp_path):
    db = tmp_path / "blackroad.db"
    db.write_text("original")

    api_dir = tmp_path / "api"
    api_dir.mkdir()
    (api_dir / "file.txt").write_text("api")

    llm_dir = tmp_path / "llm"
    llm_dir.mkdir()
    (llm_dir / "file.txt").write_text("llm")

    math_dir = tmp_path / "math"
    math_dir.mkdir()
    (math_dir / "file.txt").write_text("math")

    backup_base = tmp_path / "backups"
    log_dir = tmp_path / "logs"

    env = {
        **os.environ,
        "DB_PATH": str(db),
        "API_DIR": str(api_dir),
        "LLM_DIR": str(llm_dir),
        "MATH_DIR": str(math_dir),
        "BACKUP_BASE": str(backup_base),
        "SNAPSHOT_LOG": str(log_dir / "snap.log"),
        "ROLLBACK_LOG": str(log_dir / "rollback.log"),
    }

    _run("scripts/snapshot.sh", env)
    ts = sorted(os.listdir(backup_base))[0]

    db.write_text("corrupt")
    (api_dir / "file.txt").write_text("broken")

    _run("scripts/rollback.sh", env, [ts])

    assert db.read_text() == "original"
    assert (api_dir / "file.txt").read_text() == "api"


def test_failed_deploy_triggers_rollback(tmp_path, monkeypatch):
    db = tmp_path / "blackroad.db"
    db.write_text("good")
    api_dir = tmp_path / "api"
    api_dir.mkdir()
    (api_dir / "file.txt").write_text("api")
    llm_dir = tmp_path / "llm"
    llm_dir.mkdir()
    (llm_dir / "file.txt").write_text("llm")
    math_dir = tmp_path / "math"
    math_dir.mkdir()
    (math_dir / "file.txt").write_text("math")

    backup_base = tmp_path / "backups"
    log_dir = tmp_path / "logs"

    env = {
        **os.environ,
        "DB_PATH": str(db),
        "API_DIR": str(api_dir),
        "LLM_DIR": str(llm_dir),
        "MATH_DIR": str(math_dir),
        "BACKUP_BASE": str(backup_base),
        "SNAPSHOT_LOG": str(log_dir / "snap.log"),
        "ROLLBACK_LOG": str(log_dir / "rollback.log"),
    }

    _run("scripts/snapshot.sh", env)
    db.write_text("bad")

    import scripts.codex_sync as codex_sync

    def failing_run(cmd, **kwargs):
        if "prism_sync_build.sh" in cmd[-1]:
            raise subprocess.CalledProcessError(returncode=1, cmd=cmd)
        return subprocess.run(cmd, check=True, **kwargs)

    monkeypatch.setattr(codex_sync, "run", failing_run)

    events: list[str] = []

    def fake_post(url, json, timeout):
        events.append(json["status"])
        return SimpleNamespace()

    monkeypatch.setattr(codex_sync, "requests", SimpleNamespace(post=fake_post))

    for key, value in env.items():
        monkeypatch.setenv(key, value)

    with pytest.raises(subprocess.CalledProcessError):
        codex_sync.deploy_to_droplet()

    assert db.read_text() == "good"
    assert events and events[-1] == "deploy-rollback"
