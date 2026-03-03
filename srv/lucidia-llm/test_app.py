from importlib import util
import sys
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

ROOT = Path(__file__).resolve().parent
APP_MODULE_PATH = ROOT / "app.py"

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _load_app():
    spec = util.spec_from_file_location("lucidia_llm_app", APP_MODULE_PATH)
    if spec is None or spec.loader is None:  # pragma: no cover - safety check
        raise ImportError(f"Unable to load FastAPI app from {APP_MODULE_PATH}")

    module = util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_module = _load_app()
app = _module.app


def test_health():
    client = TestClient(app)
    resp = client.get('/health')
    assert resp.status_code == 200
    data = resp.json()
    assert data['status'] == 'ok'
    assert 'ollama' in data


def test_chat_stub():
    """When Ollama is unreachable, falls back to echo stub."""
    client = TestClient(app)
    resp = client.post('/chat', json={'prompt': 'hello'})
    assert resp.status_code == 200
    assert 'stub response' in resp.json()['text']


def test_chat_ollama(monkeypatch: pytest.MonkeyPatch):
    """When Ollama is reachable, returns Ollama response."""
    monkeypatch.setattr(_module, "_ollama_generate", lambda *a, **kw: "Ollama says hi")
    client = TestClient(app)
    resp = client.post('/chat', json={'prompt': 'hello'})
    assert resp.status_code == 200
    assert resp.json()['text'] == "Ollama says hi"
