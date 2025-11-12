import os
import urllib.parse

import requests


def _resolve_openai_base() -> str:
    base = os.getenv("OPENAI_BASE", "https://api.openai.com/v1")
    parsed = urllib.parse.urlparse(base)
    if parsed.scheme != "https":
        raise ValueError("OPENAI_BASE must use https")
    if parsed.hostname != "api.openai.com":
        raise ValueError("OPENAI_BASE host not allowed")

    return base


def _resolve_openai_key() -> str:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return key


def _openai_chat_messages(
    messages: list[dict[str, str]],
    model: str | None = None,
) -> str:
    if not isinstance(messages, list) or not messages:
        raise ValueError("messages must be a non-empty list")

    base = _resolve_openai_base()
    key = _resolve_openai_key()

    model = model or os.getenv("MODEL", "gpt-4.1")
    headers = {"Authorization": f"Bearer {key}"}
    payload = {"model": model, "messages": messages}

    r = requests.post(
        f"{base}/chat/completions", headers=headers, json=payload, timeout=120
    )
    r.raise_for_status()
    data = r.json()
    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError("OpenAI response did not include choices")
    message = choices[0].get("message", {})
    content = message.get("content")
    if content is None:
        raise RuntimeError("OpenAI response missing message content")
    return content


def _openai_chat(prompt: str, system: str = "", model: str | None = None) -> str:
    payload_messages: list[dict[str, str]] = []
    if system:
        payload_messages.append({"role": "system", "content": system})
    payload_messages.append({"role": "user", "content": prompt})
    return _openai_chat_messages(payload_messages, model)


def _ollama(prompt: str, system: str = "", model: str | None = None) -> str:
    model = model or os.getenv("MODEL", "llama3.1")
    payload = {"model": model, "prompt": (system + "\n\n" + prompt).strip(), "stream": False}
    r = requests.post("http://localhost:11434/api/generate", json=payload, timeout=120)
    r.raise_for_status()
    data = r.json()
    # Ollama returns text in 'response'
    return data.get("response", "")


def chat(prompt: str, system: str = "") -> str:
    backend = os.getenv("AI_BACKEND", "openai").lower()
    if backend == "ollama":
        return _ollama(prompt, system)
    return _openai_chat(prompt, system)
