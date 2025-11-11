from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple

from dotenv import load_dotenv

from srv.blackroad.lib.llm.claude_adapter import ClaudeClient, ClaudeConfig

CONFIG_PATH = Path("/srv/blackroad/config/.env")
SYSTEM_PROMPT_PATH = Path("/srv/blackroad/prompts/codex_claude_system.txt")


def load_system_prompt() -> Optional[str]:
    if SYSTEM_PROMPT_PATH.exists():
        return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
    return None


def build_client() -> Tuple[ClaudeConfig, ClaudeClient]:
    if CONFIG_PATH.exists():
        load_dotenv(CONFIG_PATH)
    cfg = ClaudeConfig()
    if cfg.provider == "anthropic" and not cfg.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY must be set to run the smoke test.")
    return cfg, ClaudeClient(cfg)


def main() -> None:
    cfg, client = build_client()
    system = load_system_prompt()
    print(f"Provider={cfg.provider}, Model={cfg.model}")
    resp = client.generate(
        text="Say hello to BlackRoad & Lucidia in one sentence.",
        system=system,
        max_tokens=200,
        temperature=0.2,
    )
    output = resp if isinstance(resp, str) else "".join(resp)
    print(output)


if __name__ == "__main__":
    main()
