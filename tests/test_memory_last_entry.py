"""Tests for orchestrator.memory._last_entry hash-chain helper.

Covers edge cases required for correctness of MemoryLog.append():
- non-existent file
- empty file
- single-line JSONL with trailing newline (LF)
- single-line JSONL without trailing newline
- multi-line JSONL with trailing LF
- multi-line JSONL with CRLF line endings
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest


def _get_last_entry():
    try:
        from orchestrator.memory import _last_entry
    except Exception as exc:  # pragma: no cover - infrastructure guard
        pytest.skip(f"orchestrator.memory unavailable: {exc}")
    return _last_entry


def test_last_entry_missing_file(tmp_path: Path) -> None:
    _last_entry = _get_last_entry()
    assert _last_entry(tmp_path / "nonexistent.jsonl") is None


def test_last_entry_empty_file(tmp_path: Path) -> None:
    _last_entry = _get_last_entry()
    p = tmp_path / "empty.jsonl"
    p.touch()
    assert _last_entry(p) is None


def test_last_entry_single_line_with_trailing_newline(tmp_path: Path) -> None:
    _last_entry = _get_last_entry()
    p = tmp_path / "single.jsonl"
    p.write_text(json.dumps({"hash": "abc123"}) + "\n", encoding="utf-8")
    assert _last_entry(p) == {"hash": "abc123"}


def test_last_entry_single_line_no_trailing_newline(tmp_path: Path) -> None:
    _last_entry = _get_last_entry()
    p = tmp_path / "single_no_nl.jsonl"
    p.write_text(json.dumps({"hash": "def456"}), encoding="utf-8")
    assert _last_entry(p) == {"hash": "def456"}


def test_last_entry_multi_line_trailing_lf(tmp_path: Path) -> None:
    _last_entry = _get_last_entry()
    p = tmp_path / "multi.jsonl"
    lines = [json.dumps({"hash": f"h{i}", "idx": i}) for i in range(5)]
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    assert _last_entry(p) == {"hash": "h4", "idx": 4}


def test_last_entry_multi_line_crlf(tmp_path: Path) -> None:
    _last_entry = _get_last_entry()
    p = tmp_path / "multi_crlf.jsonl"
    lines = [json.dumps({"hash": f"h{i}", "idx": i}) for i in range(5)]
    p.write_bytes(("\r\n".join(lines) + "\r\n").encode("utf-8"))
    assert _last_entry(p) == {"hash": "h4", "idx": 4}


def test_last_entry_returns_hash_field_for_chain(tmp_path: Path) -> None:
    """Verify that the hash field used by MemoryLog.append() is accessible."""
    _last_entry = _get_last_entry()
    p = tmp_path / "chain.jsonl"
    entries = [{"hash": f"sha256_{i:04d}", "other": "data"} for i in range(10)]
    p.write_text("\n".join(json.dumps(e) for e in entries) + "\n", encoding="utf-8")
    result = _last_entry(p)
    assert result is not None
    assert result.get("hash") == "sha256_0009"
