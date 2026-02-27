"""Utility agent capable of ideating stories and lightweight games."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import ClassVar, Iterable, Sequence

import sys

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parent))
    from consent_policy import ConsentRecord, ensure_full_consent  # type: ignore
else:  # pragma: no cover - executed when the package is installed
    from .consent_policy import ConsentRecord, ensure_full_consent

DEFAULT_SUPPORTED_ENGINES: tuple[str, ...] = ("unity", "unreal")

_OPERATION_SCOPE_MAP: dict[str, str] = {
    "deploy": "agent:deploy",
    "create_game": "game:create",
    "generate_game_idea": "story:ideate",
    "generate_story": "story:create",
    "generate_story_series": "story:create",
    "generate_coding_challenge": "content:create",
    "generate_code_snippet": "code:suggest",
    "proofread_paragraph": "content:edit",
    "validate_scopes": "consent:validate",
    "add_supported_engine": "agent:configure",
    "remove_supported_engine": "agent:configure",
    "set_gamma": "agent:configure",
    "write_novel": "story:create",
}

_BASE_CONSENT_SCOPES = {"outline:read", "outline:write"}
DEFAULT_CONSENT_SCOPES = frozenset(
    _BASE_CONSENT_SCOPES.union(_OPERATION_SCOPE_MAP.values())
)


class AutoNovelAgent:
    """Minimal agent capable of generating storylines."""

    def generate_storyline(self, hero: str, setting: str) -> str:
        """Return a deterministic storyline for the given hero and setting."""
        return (
            f"{hero} embarks on an adventure in {setting}, "
            "discovering the true meaning of courage."
        )
