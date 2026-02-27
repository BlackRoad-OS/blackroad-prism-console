from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from typing import Dict, List, Any, Optional


@dataclass
class PullRequest:
    title: str
    body: str
    author: str
    files: List[str]
    labels: List[str]


def load_config(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def from_pr_json(obj: Dict[str, Any]) -> PullRequest:
    return PullRequest(
        title=obj.get("title", ""),
        body=obj.get("body", ""),
        author=obj.get("author", ""),
        files=obj.get("files", []),
        labels=obj.get("labels", []),
    )


def classify_pr(pr: PullRequest, config: Dict[str, Any]) -> Dict[str, Any]:
    """Return classification with suggested labels and reviewers and checklist."""
    title = pr.title.lower()
    body = pr.body.lower()
    files = pr.files

    suggested_labels = set(pr.labels or [])
    suggested_reviewers = set()

    # simple keyword -> label rules from config
    for rule in config.get("label_rules", []):
        keywords = [k.lower() for k in rule.get("keywords", [])]
        label = rule.get("label")
        if not label:
            continue
        hay = title + "\n" + body
        if any(k in hay for k in keywords):
            suggested_labels.add(label)

    # file-based rules
    for rule in config.get("file_rules", []):
        pattern = rule.get("pattern")
        label = rule.get("label")
        if pattern and label:
            prog = re.compile(pattern)
            if any(prog.search(f) for f in files):
                suggested_labels.add(label)

    # reviewer suggestions by path or label
    for r in config.get("reviewer_rules", []):
        labels_needed = set(r.get("labels", []))
        paths = r.get("paths", [])
        reviewer = r.get("reviewer")
        if reviewer is None:
            continue
        if labels_needed and labels_needed & suggested_labels:
            suggested_reviewers.add(reviewer)
            continue
        # path matching
        for p in paths:
            prog = re.compile(p)
            if any(prog.search(f) for f in files):
                suggested_reviewers.add(reviewer)
                break

    # generate checklist
    checklist = []
    checklist.append(("Code builds locally", False))
    checklist.append(("Tests added/updated", any(re.search(r"test|spec", f) for f in files)))
    checklist.append(
        (
            "Changelog/README updated",
            any(re.search(r"changelog|readme|docs", f, re.I) for f in files),
        )
    )
    checklist.append(("PR description filled", bool(pr.body.strip())))

    return {
        "labels": sorted(suggested_labels),
        "reviewers": sorted(suggested_reviewers),
        "checklist": checklist,
    }


def format_output(classification: Dict[str, Any]) -> str:
    out = {
        "labels": classification["labels"],
        "reviewers": classification["reviewers"],
        "checklist": [f"[{'x' if ok else ' '}] {text}" for text, ok in classification["checklist"]],
    }
    return json.dumps(out, indent=2)


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Pully - simple PR organizer (dry-run)")
    p.add_argument("--config", required=True, help="Path to pully config json")
    p.add_argument("--pr-file", required=True, help="Path to PR json file (local) for analysis")
    p.add_argument("--output", help="Optional output path for result JSON")
    args = p.parse_args(argv)

    config = load_config(args.config)
    with open(args.pr_file, "r", encoding="utf-8") as f:
        pr_json = json.load(f)

    pr = from_pr_json(pr_json)
    classification = classify_pr(pr, config)
    text = format_output(classification)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text)
    else:
        print(text)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
