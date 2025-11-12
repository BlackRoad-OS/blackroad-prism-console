import os
from unittest.mock import patch

import pytest

from tools.llm import _openai_chat, _openai_chat_messages


class DummyResponse:
    def raise_for_status(self):
        pass

    def json(self):
        return {"choices": [{"message": {"content": "ok"}}]}


@patch("requests.post", return_value=DummyResponse())
def test_valid_base(mock_post):
    os.environ["OPENAI_API_KEY"] = "test-key"
    if "OPENAI_BASE" in os.environ:
        del os.environ["OPENAI_BASE"]
    assert _openai_chat("hi") == "ok"


@patch("requests.post", return_value=DummyResponse())
def test_valid_messages(mock_post):
    os.environ["OPENAI_API_KEY"] = "test-key"
    if "OPENAI_BASE" in os.environ:
        del os.environ["OPENAI_BASE"]
    assert _openai_chat_messages([{"role": "user", "content": "hi"}]) == "ok"


@patch("requests.post", return_value=DummyResponse())
def test_invalid_messages(mock_post):
    os.environ["OPENAI_API_KEY"] = "test-key"
    with pytest.raises(ValueError):
        _openai_chat_messages([])


@patch("requests.post", return_value=DummyResponse())
def test_invalid_scheme(mock_post):
    os.environ["OPENAI_API_KEY"] = "test-key"
    os.environ["OPENAI_BASE"] = "http://api.openai.com/v1"
    with pytest.raises(ValueError):
        _openai_chat("hi")
    del os.environ["OPENAI_BASE"]


@patch("requests.post", return_value=DummyResponse())
def test_invalid_host(mock_post):
    os.environ["OPENAI_API_KEY"] = "test-key"
    os.environ["OPENAI_BASE"] = "https://evil.example.com/v1"
    with pytest.raises(ValueError):
        _openai_chat("hi")
    del os.environ["OPENAI_BASE"]
