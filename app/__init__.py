"""Application package bootstrap utilities."""
from __future__ import annotations

from importlib import util
from pathlib import Path
from types import ModuleType

__all__ = ["app", "load_lucidia_llm_stub"]


_DEF_STUB_PATH = Path(__file__).resolve().parent.parent / "srv" / "lucidia-llm" / "app.py"


def load_lucidia_llm_stub(path: Path = _DEF_STUB_PATH) -> ModuleType:
    """Load the Lucidia LLM stub app module from ``srv``.

    The stub lives outside of a standard Python package structure (the directory name
    contains a hyphen), so we load it dynamically when required.
    """

    spec = util.spec_from_file_location("lucidia_llm_stub", path)
    if spec is None or spec.loader is None:  # pragma: no cover - defensive
        raise ImportError(f"Could not load stub module from {path}")

    module = util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


try:
    _stub = load_lucidia_llm_stub()
    app = getattr(_stub, "app")
except Exception:  # pragma: no cover - fallback for optional stub
    from .lucidia_api.main import app  # type: ignore (re-export)
