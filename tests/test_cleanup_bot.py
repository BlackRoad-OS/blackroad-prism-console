"""Tests for :mod:`agents.cleanup_bot`."""

from subprocess import CalledProcessError

import pytest

from agents.cleanup_bot import CleanupBot


class _CallRecorder:
    """Utility helper to record sequential command invocations."""

    def __init__(self, responses: List[object] | None = None) -> None:
        self.calls: List[tuple[str, ...]] = []
        self._responses = iter(responses or [])

    def __call__(self, *cmd: str):  # type: ignore[override]
        self.calls.append(cmd)
        try:
            return next(self._responses)
        except StopIteration:
            return None



def test_cleanup_bot_executes_git_commands(monkeypatch: pytest.MonkeyPatch) -> None:
    """The bot should execute git commands for each branch."""

    bot = CleanupBot(["feature/new"], dry_run=False)
    calls: list[tuple[str, ...]] = []

    def fake_run(*cmd: str):
        calls.append(cmd)
        return None

    monkeypatch.setattr(bot, "_run", fake_run)

def test_delete_branch_success() -> None:
    """Successful branch deletion returns True."""
    bot = CleanupBot(branches=[])
    recorder = _CallRecorder()
    bot._run = recorder  # type: ignore[assignment]

    assert bot.delete_branch("feature/refactor") is True
    assert recorder.calls == [
        ("git", "branch", "-D", "feature/refactor"),
        ("git", "push", "origin", "--delete", "feature/refactor"),
    ]


def test_delete_branch_failure_returns_false() -> None:
    """Failures during deletion should be swallowed and return False."""
    bot = CleanupBot(branches=[])

    def failing_run(*_: str):  # type: ignore[override]
        raise CalledProcessError(1, "git")

    bot._run = failing_run  # type: ignore[assignment]

    assert bot.delete_branch("stale/branch") is False


