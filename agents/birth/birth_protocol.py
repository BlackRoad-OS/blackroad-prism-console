"""Agent birth protocol implementation."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Sequence

from bootstrap_engine.utils import slugify

_AGENT_LINE = re.compile(r"^(P\d+)\s*\|\s*([^|]+)\|\s*(.+)$")


@dataclass(slots=True)
class AgentDefinition:
    agent_id: str
    name: str
    role: str


@dataclass(slots=True)
class AgentIdentity:
    agent_id: str
    slug: str
    name: str
    role: str
    handle: str
    email: str
    born_at: str
    source: str


@dataclass(slots=True)
class BirthResult:
    attempted: int
    created: int
    skipped: int
    path: Path
    dry_run: bool


def load_agent_definitions(census_path: Path) -> List[AgentDefinition]:
    definitions: List[AgentDefinition] = []
    for line in census_path.read_text(encoding="utf-8").splitlines():
        match = _AGENT_LINE.match(line.strip())
        if not match:
            continue
        agent_id, name, role = match.groups()
        definitions.append(AgentDefinition(agent_id=agent_id.strip(), name=name.strip(), role=role.strip()))
    return definitions


def load_identities(identity_path: Path) -> dict[str, AgentIdentity]:
    identities: dict[str, AgentIdentity] = {}
    if not identity_path.exists():
        return identities
    for raw in identity_path.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        data = json.loads(raw)
        identity = AgentIdentity(
            agent_id=data["agent_id"],
            slug=data["slug"],
            name=data["name"],
            role=data["role"],
            handle=data.get("handle", f"@{data['slug']}") or f"@{data['slug']}",
            email=data.get("email", f"{data['slug']}@agents.blackroad"),
            born_at=data.get("born_at", datetime.now(timezone.utc).isoformat()),
            source=data.get("source", "unknown"),
        )
        identities[identity.agent_id] = identity
    return identities


def _serialise_identity(identity: AgentIdentity) -> str:
    payload = {
        "agent_id": identity.agent_id,
        "slug": identity.slug,
        "name": identity.name,
        "role": identity.role,
        "handle": identity.handle,
        "email": identity.email,
        "born_at": identity.born_at,
        "source": identity.source,
    }
    return json.dumps(payload, ensure_ascii=False)


def _build_identity(definition: AgentDefinition, source: Path) -> AgentIdentity:
    slug = slugify(definition.name) or definition.agent_id.lower()
    return AgentIdentity(
        agent_id=definition.agent_id,
        slug=slug,
        name=definition.name,
        role=definition.role,
        handle=f"@{slug}",
        email=f"{slug}@agents.blackroad",
        born_at=datetime.now(timezone.utc).isoformat(),
        source=str(source),
    )


def birth_agents(
    census_path: Path,
    identity_path: Path,
    ids: Sequence[str] | None = None,
    limit: int | None = None,
    dry_run: bool = False,
) -> BirthResult:
    definitions = load_agent_definitions(census_path)
    selected: Iterable[AgentDefinition]
    if ids:
        wanted = {item.strip().upper() for item in ids}
        selected = [item for item in definitions if item.agent_id.upper() in wanted]
    else:
        selected = definitions
    if limit is not None:
        selected = list(selected)[: max(limit, 0)]
    else:
        selected = list(selected)

    existing = load_identities(identity_path)
    new_entries: List[AgentIdentity] = []
    for definition in selected:
        if definition.agent_id in existing:
            continue
        new_entries.append(_build_identity(definition, census_path))

    if not dry_run and new_entries:
        identity_path.parent.mkdir(parents=True, exist_ok=True)
        with identity_path.open("a", encoding="utf-8") as handle:
            for identity in new_entries:
                handle.write(_serialise_identity(identity) + "\n")

    return BirthResult(
        attempted=len(selected),
        created=len(new_entries),
        skipped=len(selected) - len(new_entries),
        path=identity_path,
        dry_run=dry_run,
    )


def summarise_agent_registry(census_path: Path, identity_path: Path) -> dict[str, int | list[str]]:
    definitions = load_agent_definitions(census_path)
    identities = load_identities(identity_path)
    defined_ids = {definition.agent_id for definition in definitions}
    born_ids = set(identities.keys())
    missing = sorted(defined_ids - born_ids)
    return {
        "defined_count": len(defined_ids),
        "born_count": len(born_ids),
        "missing_count": len(missing),
        "missing_ids": missing[:10],
    }
"""Utilities for "birthing" agent identities from census and archetype data."""

