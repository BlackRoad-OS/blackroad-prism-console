"""Generate local Hugging Face model artifacts for all registered agents."""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import yaml

from hf_publish import publish_to_huggingface

CONFIG_DIR = Path("configs/agents")


class HuggingFaceSpaceError(RuntimeError):
    """Raised when an agent configuration contains an invalid space path."""


def _load_agent_configs() -> Iterable[Tuple[Path, Dict[str, object]]]:
    """Yield ``(path, config)`` pairs for each agent configuration file."""

    if not CONFIG_DIR.exists():
        raise FileNotFoundError(f"Missing agent config directory: {CONFIG_DIR}")

    for config_path in sorted(CONFIG_DIR.glob("*.yaml")):
        raw_text = config_path.read_text(encoding="utf-8")
        # YAML parser handles both YAML and JSON (JSON is valid YAML)
        data = yaml.safe_load(raw_text)
        if not isinstance(data, dict):  # pragma: no cover - defensive
            raise ValueError(f"Agent config must be a mapping: {config_path}")
        yield config_path, data


def _parse_space_path(space: str) -> Tuple[str, str]:
    """Return the ``(namespace, slug)`` extracted from a Hugging Face space path."""

    cleaned = space.strip().strip("/")
    if cleaned.startswith("spaces/"):
        cleaned = cleaned[len("spaces/") :]
    parts = cleaned.split("/")
    if len(parts) != 2:
        raise HuggingFaceSpaceError(
            f"Expected `<namespace>/<slug>` space path, got: {space!r}"
        )
    return parts[0], parts[1]


def _build_agent_payload(config: Dict[str, object], slug: str) -> Dict[str, object]:
    """Construct the payload passed to :func:`publish_to_huggingface`."""

    context = config.get("context") if isinstance(config.get("context"), dict) else {}
    metadata = config.get("metadata") if isinstance(config.get("metadata"), dict) else {}

    return {
        "id": config.get("uuid"),
        "name": config.get("name"),
        "base_model": config.get("model"),
        "domain": config.get("domain"),
        "description": config.get("description"),
        "parent_agent": context.get("parent"),
        "traits": config.get("traits", []),
        "status": metadata.get("status", "active"),
        "slug": slug,
    }


def generate_models(*, dry_run: bool = False) -> List[Dict[str, object]]:
    """Create Hugging Face model artifacts for every agent configuration."""

    results: List[Dict[str, object]] = []

    for config_path, config in _load_agent_configs():
        huggingface_cfg = config.get("huggingface")
        if not isinstance(huggingface_cfg, dict):
            raise HuggingFaceSpaceError(
                f"Agent configuration missing `huggingface` block: {config_path}"
            )
        space = huggingface_cfg.get("space")
        if not isinstance(space, str) or not space.strip():
            raise HuggingFaceSpaceError(
                f"Agent configuration missing Hugging Face space name: {config_path}"
            )

        namespace, slug = _parse_space_path(space)
        agent_payload = _build_agent_payload(config, slug)

        result: Dict[str, object] = {
            "config_path": str(config_path),
            "namespace": namespace,
            "slug": slug,
            "huggingface_repo": f"{namespace}/{slug}",
        }

        if dry_run:
            result["published"] = False
        else:
            publish_result = publish_to_huggingface(
                agent_payload,
                namespace=namespace,
            )
            result.update(
                {
                    "url": publish_result.url,
                    "published": publish_result.pushed,
                    "repo_id": publish_result.repo_id,
                }
            )
        results.append(result)

    return results


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Generate local Hugging Face artifacts for all agent configurations. "
            "Without a Hugging Face token the data is stored under registry/huggingface/."
        )
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse configuration files without writing any artifacts.",
    )

    args = parser.parse_args()
    results = generate_models(dry_run=args.dry_run)

    for item in results:
        status = "published" if item.get("published") else "generated"
        repo = item["huggingface_repo"]
        url = item.get("url", "(local export)")
        print(f"[{status}] {repo} -> {url}")


if __name__ == "__main__":
    main()
