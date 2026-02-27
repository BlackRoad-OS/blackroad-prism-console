
import json
from pathlib import Path

from tools import pully


def load_example_config():
    p = Path(__file__).parents[1] / "tools" / "pully_config.example.json"
    return json.loads(p.read_text(encoding="utf-8"))


def test_classify_label_by_keyword():
    config = load_example_config()
    pr = pully.PullRequest(
        title="Fix crash on startup",
        body="this fixes a panic",
        author="alice",
        files=["src/app/main.py"],
        labels=[],
    )
    out = pully.classify_pr(pr, config)
    assert "bug" in out["labels"]


def test_classify_docs_by_md_file():
    config = load_example_config()
    pr = pully.PullRequest(
        title="update docs", body="", author="bob", files=["README.md"], labels=[]
    )
    out = pully.classify_pr(pr, config)
    assert "docs" in out["labels"]


def test_reviewer_by_path():
    config = load_example_config()
    pr = pully.PullRequest(
        title="Add frontend feature",
        body="implements X",
        author="carol",
        files=["src/frontend/widget.js"],
        labels=[],
    )
    out = pully.classify_pr(pr, config)
    assert "@frontend-team" in out["reviewers"]
