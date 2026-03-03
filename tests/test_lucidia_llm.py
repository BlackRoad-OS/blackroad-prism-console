from importlib import util
from pathlib import Path
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient
import pytest

spec = util.spec_from_file_location("lucidia_llm_app", Path("lucidia-llm/app.py"))
module = util.module_from_spec(spec)
assert spec.loader is not None  # for mypy
spec.loader.exec_module(module)  # type: ignore[attr-defined]

client = TestClient(module.app)


def test_chat_stub():
    """When Ollama is unreachable the stub response is returned."""
    resp = client.post("/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["choices"][0]["content"].startswith("Lucidia stub:")


def test_chat_ollama(monkeypatch: pytest.MonkeyPatch):
    """When Ollama is reachable, its response is returned."""
    def fake_ollama_chat(messages, model=None):
        return "Hello from Ollama!"

    monkeypatch.setattr(module, "_ollama_chat", fake_ollama_chat)
    resp = client.post("/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["choices"][0]["content"] == "Hello from Ollama!"


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert "ollama" in data


def test_models_stub():
    """When Ollama is unreachable, models endpoint returns stub backend."""
    resp = client.get("/models")
    assert resp.status_code == 200
    data = resp.json()
    assert data["backend"] == "stub"


def test_models_ollama(monkeypatch: pytest.MonkeyPatch):
    """When Ollama is available, models endpoint returns Ollama models."""
    monkeypatch.setattr(module, "_ollama_models", lambda: ["phi3:mini", "llama3.1"])
    resp = client.get("/models")
    assert resp.status_code == 200
    data = resp.json()
    assert data["backend"] == "ollama"
    assert "phi3:mini" in data["models"]


@pytest.mark.parametrize(
    "payload",
    (
        [{"generated_text": "hello world"}],
        [{"text": "hello world"}],
        ["hello world"],
        [type("Obj", (), {"generated_text": "hello world"})()],
    ),
)
def test_chat_with_pipe(monkeypatch: pytest.MonkeyPatch, payload):
    def fake_pipe(prompt: str, max_new_tokens: int):
        return payload

    # Disable Ollama so the HF pipeline fallback fires
    monkeypatch.setattr(module, "_ollama_chat", lambda *a, **kw: None)
    monkeypatch.setattr(module, "_get_pipe", lambda: fake_pipe)
    resp = client.post("/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["choices"][0]["content"] == "hello world"
