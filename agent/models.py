"""Local model discovery and execution helpers for BlackRoad devices."""

from __future__ import annotations

import pathlib
import shutil
import subprocess
from typing import Dict, List

MODELS_DIR = pathlib.Path("/var/lib/blackroad/models")
MODELS_DIR.mkdir(parents=True, exist_ok=True)


def list_models() -> List[Dict[str, str]]:
    """List available local models by scanning ``MODELS_DIR`` for GGUF/bin files."""

    out: List[Dict[str, str]] = []
    for pattern in ("*.gguf", "*.bin"):
        for file in MODELS_DIR.glob(pattern):
            out.append({"name": file.stem, "path": str(file)})
    return out


def run_llama(model_path: str, prompt: str, n_predict: int = 128) -> Dict[str, str]:
    """Run ``llama.cpp`` locally once and return the captured output."""

    exe = shutil.which("llama") or shutil.which("main")
    if not exe:
        return {"error": "llama.cpp binary not found"}

    cmd = [exe, "-m", model_path, "-p", prompt, "-n", str(max(1, int(n_predict)))]

    try:
        output = subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT)
    except FileNotFoundError:
        return {"error": "model file not found"}
    except subprocess.CalledProcessError as exc:  # pragma: no cover - propagated to UI
        return {"error": exc.output}
    except Exception as exc:  # pragma: no cover - defensive catch for runtime issues
        return {"error": str(exc)}
    return {"result": output}


__all__ = ["list_models", "run_llama", "MODELS_DIR"]
"""Helpers for discovering and streaming local llama.cpp models."""

