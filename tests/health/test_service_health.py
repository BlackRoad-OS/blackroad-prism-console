from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


def test_autopal_api_health_exposes_dependencies() -> None:
    from services.autopal.app import main as autopal_main

    with TestClient(autopal_main.app) as client:
        response = client.get("/healthz")
        data = response.json()
        assert data["service"] == "autopal"
        assert data["dependencies"]["rate_limiter"]["status"] == "ok"

        metrics = client.get("/metrics")
        assert 'service_dependency_up{service="autopal",dependency="rate_limiter"}' in metrics.text


@pytest.fixture
def autopal_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    config = {
        "feature_flags": {"global_enabled": True, "require_step_up": False},
        "break_glass": {
            "enabled": True,
            "alg": "HS256",
            "hmac_secret_env": "AUTOPAL_BREAK_GLASS_SECRET",
            "ttl_seconds": 600,
            "allowlist_endpoints": ["POST /secrets/materialize"],
            "allowed_subjects": ["ops-oncall"],
        },
        "audit": {"enabled": True, "sink": "stdout", "redact_values": True},
    }
    config_path = tmp_path / "autopal.config.json"
    config_path.write_text(json.dumps(config))
    monkeypatch.setenv("AUTOPAL_CONFIG_PATH", str(config_path))
    monkeypatch.setenv("AUTOPAL_BREAK_GLASS_SECRET", "dev-secret")
    return config_path


def test_autopal_console_health_reports_config(
    autopal_config: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    for module_name in list(sys.modules.keys()):
        if module_name.startswith("services.autopal"):
            sys.modules.pop(module_name)
    module = importlib.import_module("services.autopal.app")
    with TestClient(module.app) as client:
        response = client.get("/healthz")
        data = response.json()
        assert data["service"] == "autopal-console"
        assert data["dependencies"]["config"]["status"] == "ok"

        metrics = client.get("/metrics")
        assert 'service_dependency_up{service="autopal-console",dependency="config"}' in metrics.text


def test_materials_service_health(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FEATURE_MATERIALS", "true")
    monkeypatch.setenv("MATERIALS_RUNS_DIR", str(tmp_path))
    if "services.materials_service.app" in sys.modules:
        sys.modules.pop("services.materials_service.app")
    module = importlib.import_module("services.materials_service.app")
    with TestClient(module.app) as client:
        response = client.get("/healthz")
        data = response.json()
        assert data["dependencies"]["feature_flag"]["status"] == "ok"
        assert data["dependencies"]["workspace"]["status"] == "ok"

        metrics = client.get("/metrics")
        assert 'service_dependency_up{service="materials-service",dependency="workspace"}' in metrics.text

