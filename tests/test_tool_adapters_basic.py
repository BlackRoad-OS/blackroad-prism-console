from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

from tools import calendar, db, email, web_search


def test_db_query_sqlite(tmp_path: Path) -> None:
    database = tmp_path / "example.sqlite"
    connection = sqlite3.connect(database)
    with connection:
        connection.execute("create table demo(id integer primary key, value text)")
        connection.execute("insert into demo(value) values (?)", ("alpha",))
    rows = db.query("select id, value from demo", database)
    assert rows == [{"id": 1, "value": "alpha"}]


def test_db_query_missing_database(tmp_path: Path) -> None:
    database = tmp_path / "missing.sqlite"
    rows = db.query("select 1", database)
    assert rows[0]["result"] == "missing-database"


def test_email_send_writes_to_log(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    log_file = tmp_path / "outbox.log"
    monkeypatch.setenv("PRISM_EMAIL_LOG_FILE", str(log_file))
    for variable in [
        "PRISM_EMAIL_SMTP_HOST",
        "PRISM_EMAIL_SMTP_USERNAME",
        "PRISM_EMAIL_SMTP_PASSWORD",
        "PRISM_EMAIL_FROM",
    ]:
        monkeypatch.delenv(variable, raising=False)

    email.send("user@example.com", "Subject", "Body text")

    content = log_file.read_text(encoding="utf-8")
    assert "Subject: Subject" in content
    assert "Body text" in content


def test_calendar_create_event(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    log_file = tmp_path / "calendar.jsonl"
    monkeypatch.setenv("PRISM_CALENDAR_EVENT_LOG", str(log_file))

    payload = calendar.create_event({"title": "Demo"})

    assert payload["title"] == "Demo"
    stored = [json.loads(line) for line in log_file.read_text(encoding="utf-8").splitlines()]
    assert stored[0]["title"] == "Demo"


def test_web_search_fallback(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PRISM_WEB_SEARCH_INDEX", raising=False)

    results = web_search.search("nonexistent query")

    assert results[0].title == "Web search unavailable"
    assert "No indexed results" in results[0].snippet


def test_web_search_with_index(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    index = tmp_path / "index.json"
    search_index_data = [
        {
            "title": "Prism Overview",
            "url": "https://example.com/prism",
            "snippet": "Prism console overview documentation.",
        }
    ]
    index.write_text(
        json.dumps(search_index_data),
        encoding="utf-8",
    )
    monkeypatch.setenv("PRISM_WEB_SEARCH_INDEX", str(index))

    results = web_search.search("overview")

    assert results[0].url == "https://example.com/prism"


def test_web_search_rejects_empty_query() -> None:
    with pytest.raises(ValueError):
        web_search.search("   ")
