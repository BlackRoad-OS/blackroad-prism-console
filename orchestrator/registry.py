from __future__ import annotations

import builtins
from importlib import import_module
from pathlib import Path
from typing import Dict, List

from .base import BaseBot

_registry: Dict[str, BaseBot] = {}


def register(bot: BaseBot) -> None:
    _registry[bot.NAME] = bot


def get(name: str) -> BaseBot:
    return _registry[name]


def list() -> List[BaseBot]:
    return builtins.list(_registry.values())


def _discover(path: Path) -> None:
    if not path.exists():
        return
    for file in path.glob("*_bot.py"):
        module_name = f"{path.name}.{file.stem}"
        import_module(module_name)


_repo_root = Path(__file__).resolve().parent.parent
_discover(_repo_root / "bots")
_plugins = _repo_root / "plugins"
if _plugins.exists():
    _discover(_plugins)
