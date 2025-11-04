"""Offline friendly web search adapter."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterable

_DEFAULT_INDEX = Path("fixtures/web_search/index.json")


@dataclass(slots=True)
class SearchResult:
    title: str
    url: str
    snippet: str


class SearchIndex:
    """Small text index backed by a JSON file."""

    def __init__(self, entries: Iterable[dict[str, str]]):
        self._entries = [
            SearchResult(entry.get("title", ""), entry.get("url", ""), entry.get("snippet", ""))
            for entry in entries
        ]

    @classmethod
    def load(cls, path: Path) -> "SearchIndex":
        if not path.exists():
            return cls([])
        with path.open(encoding="utf-8") as file:
            data = json.load(file)
        if not isinstance(data, list):
            raise ValueError("Search index must be a list of objects")
        return cls([entry for entry in data if isinstance(entry, dict)])

    def search(self, query: str, *, limit: int = 5) -> list[SearchResult]:
        q = query.lower()
        matches = [
            result
            for result in self._entries
            if q in (result.snippet or result.title).lower()
        ]
        return matches[:limit]


@lru_cache(maxsize=1)
def _load_index(path_str: str) -> SearchIndex:
    path = Path(path_str)
    return SearchIndex.load(path.expanduser().resolve())


def search(query: str, *, limit: int = 5) -> list[SearchResult]:
    """Return search results from the local index or a helpful fallback."""

    if not query.strip():
        raise ValueError("Query must not be empty")

    configured = os.getenv("PRISM_WEB_SEARCH_INDEX", "")
    path_str = configured if configured else str(_DEFAULT_INDEX)
    index = _load_index(path_str)
    results = index.search(query, limit=limit)
    if results:
        return results

    return [
        SearchResult(
            title="Web search unavailable",
            url="https://example.com/prism-offline-search",
            snippet=(
                "No indexed results were found for the query. Configure a search index via "
                "PRISM_WEB_SEARCH_INDEX to surface domain-specific answers."
            ),
        )
    ]


__all__ = ["search", "SearchResult"]
