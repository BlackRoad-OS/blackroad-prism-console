"""Utility bot for cleaning up merged Git branches."""

from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass, field
from subprocess import CalledProcessError
from typing import Dict, Iterable, List

LOGGER = logging.getLogger(__name__)


@dataclass
class CleanupSummary:
    """Summary of cleanup results for a batch of branches."""

    results: Dict[str, bool]

    @property
    def deleted(self) -> int:
        """Number of branches successfully deleted."""
        return sum(1 for ok in self.results.values() if ok)

    @property
    def failed(self) -> int:
        """Number of branches that failed to delete."""
        return sum(1 for ok in self.results.values() if not ok)

    def is_empty(self) -> bool:
        """Return ``True`` when there are no branches in the summary."""
        return not self.results

    def log_details(self, logger: logging.Logger) -> None:
        """Log per-branch results and overall summary using ``logger``."""
        for branch, ok in self.results.items():
            status = "deleted" if ok else "failed"
            logger.info("%s: %s", branch, status)
        logger.info("Summary: %d deleted, %d failed", self.deleted, self.failed)


@dataclass
class CleanupBot:
    """Delete local and remote Git branches once work is merged."""

    branches: List[str]
    dry_run: bool = False
    remote: str = "origin"

    def _run(self, *cmd: str):
        """Execute a command. Can be monkeypatched in tests."""
        return subprocess.run(list(cmd), check=True, capture_output=True, text=True)

    def delete_branch(self, branch: str) -> bool:
        """Delete a branch locally and remotely. Returns True on success."""
        if self.dry_run:
            LOGGER.info("DRY-RUN: would delete branch %s", branch)
            return True
        try:
            self._run("git", "branch", "-D", branch)
            self._run("git", "push", self.remote, "--delete", branch)
            return True
        except CalledProcessError:
            return False

    def cleanup(self) -> CleanupSummary:
        """Remove the configured branches and return a summary."""
        results: Dict[str, bool] = {}
        for branch in self.branches:
            results[branch] = self.delete_branch(branch)
        return CleanupSummary(results)
