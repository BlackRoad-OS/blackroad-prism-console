"""Tools for automating pull request workflows."""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Optional, Sequence

import requests

Command = Sequence[str] | str


@dataclass
class AutomatedPullRequestManager:
    """Automate common PR maintenance and collaboration tasks.

    The manager is intentionally lightweight – it shells out to Git and other
    command-line tools so it can run inside the existing automations without
    requiring additional services.  The public helpers are structured so that
    higher level orchestrators (GitHub webhooks, chat-ops bots, etc.) can call
    into them directly during tests without touching the network.
    """

    repo: str
    branch_prefix: str = "codex/"
    default_reviewer: str = "alexa"
    codex_trigger: str = "@codex"
    log_file: str = "pr_autopilot.log"
    token: Optional[str] = None
    auto_fix_commands: tuple[Command, ...] = (("bash", "fix-everything.sh"),)
    max_fix_iterations: int = 3
    _logger: logging.Logger = field(init=False, repr=False)

    def __post_init__(self) -> None:
        if self.token is None:
            self.token = os.getenv("GITHUB_TOKEN")
        self._logger = logging.getLogger(self.__class__.__name__)
        if not logging.getLogger().handlers:
            logging.basicConfig(filename=self.log_file, level=logging.INFO)

    # ------------------------------------------------------------------
    # Git helpers
    # ------------------------------------------------------------------
    def monitor_repo(self) -> bool:
        """Return ``True`` if the current working tree has uncommitted changes."""

        return self._has_uncommitted_changes(Path.cwd())

    def prepare_draft_pr(self, base_branch: str = "main") -> Optional[dict]:
        """Create a draft pull request for the current HEAD.

        The method checks that the working tree is clean, creates a timestamped
        branch, pushes it, and finally opens a draft pull request targeting the
        provided ``base_branch``.  A short diff excerpt is attached so reviewers
        can quickly gauge the change.
        """

        repo_root = Path.cwd()
        if self._has_uncommitted_changes(repo_root):
            self.log(
                "Working tree has uncommitted changes; commit or stash them before "
                "preparing a draft PR."
            )
            return None

        commit_msg = subprocess.run(
            ["git", "log", "-1", "--pretty=%s"],
            capture_output=True,
            text=True,
            check=False,
            cwd=repo_root,
        ).stdout.strip()
        if not commit_msg:
            commit_msg = "Automated draft"

        branch_name = f"{self.branch_prefix}{int(time.time())}"
        try:
            subprocess.run(["git", "checkout", "-b", branch_name], cwd=repo_root, check=True)
            subprocess.run(
                ["git", "push", "-u", "origin", branch_name], cwd=repo_root, check=True
            )
        except subprocess.CalledProcessError as exc:
            self.log(f"Failed to publish draft branch {branch_name!r}: {exc}")
            return None

        diff = subprocess.run(
            ["git", "diff", f"origin/{base_branch}..."],
            capture_output=True,
            text=True,
            check=False,
            cwd=repo_root,
        ).stdout
        body = f"### Diff Summary\n```\n{diff[:1000]}\n```\n"

        try:
            pr = self._create_pr(commit_msg, branch_name, base_branch, body)
        except requests.RequestException as exc:
            self.log(f"Failed to open draft PR for branch {branch_name!r}: {exc}")
            return None

        self._assign_reviewer(pr["number"])
        self.auto_enhance_pull_request(pr["number"], branch_name)
        self._logger.info("Opened draft PR #%s", pr["number"])
        return pr

    # ------------------------------------------------------------------
    # Comment orchestration
    # ------------------------------------------------------------------
    def process_comment(
        self,
        comment: str,
        *,
        pr_number: Optional[int] = None,
        branch_name: Optional[str] = None,
    ) -> None:
        """Execute the tasks requested in ``comment``.

        The method supports natural language requests ("run security scans") and
        explicit directives (``@codex run tests``).  Each action is executed at
        most once per invocation even if it is requested multiple times in the
        same comment.
        """

        commands = self._extract_commands(comment)
        actions_run: set[str] = set()

        def run_once(key: str, func: Callable[[], None]) -> None:
            if key in actions_run:
                return
            try:
                func()
            except Exception as exc:  # pragma: no cover - defensive logging
                self.log(f"Action {key!r} failed: {exc}")
            else:
                actions_run.add(key)

        def apply_comment_fixes_once() -> None:
            run_once(
                "apply_comment_fixes",
                lambda: self.apply_comment_fixes(pr_number=pr_number, branch_name=branch_name),
            )

        # Natural-language hints that should trigger tasks even before parsing
        lowered = comment.lower()
        if "review and test" in lowered or "run tests" in lowered:
            run_once("run_tests", self.run_tests)
        if "set up ci" in lowered or "preview deploy" in lowered:
            run_once("setup_ci", self.setup_ci_and_preview_deploy)
        if "security" in lowered or "dependency" in lowered:
            run_once("security_scans", self.run_security_and_dependency_scans)
        if "apply comment fixes" in lowered:
            apply_comment_fixes_once()

        for command in commands:
            if "review" in command and "test" in command:
                run_once("run_tests", self.run_tests)
            if command.startswith("run tests"):
                run_once("run_tests", self.run_tests)
            if "set up ci" in command or "preview" in command:
                run_once("setup_ci", self.setup_ci_and_preview_deploy)
            if "security" in command or "dependency" in command:
                run_once("security_scans", self.run_security_and_dependency_scans)
            if command.startswith("fix comments"):
                apply_comment_fixes_once()
            if command.startswith("apply "):
                path = command[6:].strip()
                if path == ".github/prompts/codex-fix-comments.md":
                    apply_comment_fixes_once()
                else:
                    self.log(f"Unhandled apply directive for {path!r}")
            if command.startswith("patch"):
                self.log("Patch directive received but no patch context provided; skipping.")
            if command.startswith("ship when green"):
                if pr_number is not None:
                    non_none_pr_number = pr_number  # type: int
                    run_once("auto_merge", lambda: self.enable_auto_merge(non_none_pr_number))
                else:
                    self.log("Ship when green requested but PR number missing; skipping auto-merge.")

    def _extract_commands(self, comment: str) -> list[str]:
        """Return normalized commands embedded in ``comment``."""

        commands: list[str] = []
        for line in comment.splitlines():
            stripped = line.strip()
            if not stripped or "@codex" not in stripped.lower():
                continue
            tokens = stripped.split()
            while tokens and tokens[0].startswith("@"):
                tokens.pop(0)
            if not tokens:
                continue
            command = " ".join(tokens)
            command = command.split("#", 1)[0].strip().lower()
            if command:
                commands.append(command)
        return commands

    # ------------------------------------------------------------------
    # High-level actions
    # ------------------------------------------------------------------
    def run_tests(self) -> None:
        """Run the fast local test suites if available."""

        repo_root = Path(__file__).resolve().parents[1]
        commands: list[Command] = []
        if (repo_root / "pytest.ini").exists() or (repo_root / "tests").exists():
            commands.append([sys.executable, "-m", "pytest", "-q"])
        package_json = repo_root / "package.json"
        node_modules = repo_root / "node_modules"
        if package_json.exists() and node_modules.exists():
            commands.append(["npm", "test", "--", "--watch=false"])
        if not commands:
            self.log("No local test suites detected; skipping run.")
            return
        self._run_commands(commands, repo_root, "tests")

    def setup_ci_and_preview_deploy(self) -> None:
        """Ensure CI and preview workflows exist, creating stubs if necessary."""

        repo_root = Path(__file__).resolve().parents[1]
        workflows = {
            repo_root / ".github/workflows/ci.yml": self._ci_stub_content(),
            repo_root / ".github/workflows/preview.yml": self._preview_stub_content(),
        }
        created: list[Path] = []
        for path, template in workflows.items():
            if path.exists():
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(template, encoding="utf-8")
            created.append(path)
        if created:
            names = ", ".join(str(p.relative_to(repo_root)) for p in created)
            self.log(f"Created placeholder workflows: {names}")
        else:
            self.log("CI and preview workflows already present; nothing to do.")

    def run_security_and_dependency_scans(self) -> None:
        """Execute lightweight dependency checks available locally."""

        repo_root = Path(__file__).resolve().parents[1]
        commands: list[Command] = []
        requirements = [
            repo_root / "requirements.txt",
            repo_root / "requirements-dev.txt",
            repo_root / "pyproject.toml",
        ]
        if any(path.exists() for path in requirements):
            commands.append([sys.executable, "-m", "pip", "check"])
        package_json = repo_root / "package.json"
        package_lock = repo_root / "package-lock.json"
        if package_json.exists() and package_lock.exists():
            commands.append(["npm", "audit", "--omit=dev"])
        if not commands:
            self.log("No dependency manifests found; skipping security scans.")
            return
        self._run_commands(commands, repo_root, "security scans")

    # ------------------------------------------------------------------
    # Existing automation entry points
    # ------------------------------------------------------------------
    def handle_trigger(
        self,
        phrase: str,
        pr_number: Optional[int] = None,
        branch_name: Optional[str] = None,
    ) -> None:
        """Backward compatible trigger handler used by legacy scripts."""

        phrase_lower = phrase.lower()

        if "fix comments" in phrase_lower:
            self.apply_comment_fixes(pr_number=pr_number, branch_name=branch_name)
        elif "summarize" in phrase_lower:
            self.log("Summarizing PR (placeholder)")
        elif "merge" in phrase_lower and pr_number is not None:
            self.enable_auto_merge(pr_number)
        elif "ship when green" in phrase_lower and pr_number is not None:
            self.enable_auto_merge(pr_number)
        elif "merge" in phrase_lower:
            self.log("Merge trigger received but no PR number supplied; skipping.")

    def apply_comment_fixes(
        self,
        pr_number: Optional[int] = None,
        branch_name: Optional[str] = None,
    ) -> None:
        """Execute the Codex fixer script to address review comments."""

        repo_root = Path(__file__).resolve().parents[1]

        if branch_name:
            try:
                subprocess.run(
                    ["git", "checkout", branch_name],
                    check=True,
                    cwd=repo_root,
                )
            except (OSError, subprocess.CalledProcessError) as exc:
                self.log(f"Unable to checkout branch {branch_name!r}: {exc}")
                return

        try:
            subprocess.run(
                [
                    "node",
                    ".github/tools/codex-apply.js",
                    ".github/prompts/codex-fix-comments.md",
                ],
                check=True,
                cwd=repo_root,
            )
            self.log("Applied comment fixes")
        except (OSError, subprocess.CalledProcessError) as exc:
            self.log(f"Failed to apply comment fixes: {exc}")
            return

        if branch_name and self._has_uncommitted_changes(repo_root):
            if not self._commit_with_message(
                repo_root,
                branch_name,
                "chore: apply codex comment fixes",
            ):
                return

        if pr_number is not None:
            self._comment_on_pr(pr_number, "Comment fixes applied :sparkles:")

        if branch_name and pr_number is not None:
            self.auto_enhance_pull_request(pr_number, branch_name)
            self.enable_auto_merge(pr_number)

    def log(self, message: str) -> None:
        """Write a message to the log file."""

        self._logger.info(message)

    def auto_enhance_pull_request(self, pr_number: int, branch_name: str) -> None:
        """Apply configured fixers to iteratively improve an open pull request."""

        if not self.auto_fix_commands:
            self.log("No auto-fix commands configured; skipping enhancements.")
            return

        repo_root = Path(__file__).resolve().parents[1]
        try:
            subprocess.run(["git", "checkout", branch_name], cwd=repo_root, check=True)
        except (OSError, subprocess.CalledProcessError) as exc:
            self.log(f"Unable to checkout branch {branch_name!r}: {exc}")
            return

        for iteration in range(1, self.max_fix_iterations + 1):
            self.log(f"Running auto-fix iteration {iteration} for PR #{pr_number}")

            for command in self.auto_fix_commands:
                self._run_auto_fix_command(command, repo_root)

            if not self._has_uncommitted_changes(repo_root):
                self.log(
                    f"No changes detected after auto-fix iteration {iteration}; stopping."
                )
                break

            if not self._commit_and_push(branch_name, repo_root, iteration):
                break

            self._comment_on_pr(
                pr_number,
                f"Auto-fix pass {iteration} applied :sparkles:",
            )

    # ------------------------------------------------------------------
    # Low-level helpers
    # ------------------------------------------------------------------
    def _ci_stub_content(self) -> str:
        return (
            "name: CI\n"
            "on:\n  push:\n  pull_request:\n"
            "jobs:\n  lint:\n    runs-on: ubuntu-latest\n    steps:\n"
            "      - uses: actions/checkout@v4\n"
            "      - name: Placeholder\n        run: echo 'CI stub'\n"
        )

    def _preview_stub_content(self) -> str:
        return (
            "name: Preview Deploy\n"
            "on:\n  pull_request:\n    types: [opened, synchronize]\n"
            "jobs:\n  preview:\n    runs-on: ubuntu-latest\n    steps:\n"
            "      - uses: actions/checkout@v4\n"
            "      - name: Placeholder\n        run: echo 'Preview deploy stub'\n"
        )

    def _run_commands(self, commands: Iterable[Command], repo_root: Path, label: str) -> None:
        for command in commands:
            self._run_auto_fix_command(command, repo_root)
        self.log(f"Completed {label} commands")

    def _has_uncommitted_changes(self, cwd: Path) -> bool:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True,
            text=True,
            check=False,
            cwd=cwd,
        )
        return bool(result.stdout.strip())

    def _run_auto_fix_command(self, command: Command, repo_root: Path) -> bool:
        shell = isinstance(command, str)
        cmd = command if shell else list(command)
        try:
            subprocess.run(
                cmd,
                cwd=repo_root,
                check=True,
                shell=shell,
            )
            return True
        except (OSError, subprocess.CalledProcessError) as exc:
            self.log(f"Auto-fix command {command!r} failed: {exc}")
            return False

    def _commit_and_push(self, branch_name: str, repo_root: Path, iteration: int) -> bool:
        try:
            subprocess.run(["git", "add", "-A"], cwd=repo_root, check=True)
            commit_message = f"chore: auto improvements (pass {iteration})"
            subprocess.run(
                ["git", "commit", "-m", commit_message],
                cwd=repo_root,
                check=True,
            )
            subprocess.run(
                ["git", "push", "origin", branch_name],
                cwd=repo_root,
                check=True,
            )
            return True
        except subprocess.CalledProcessError as exc:
            self.log(f"Failed to commit/push auto-fix iteration {iteration}: {exc}")
            return False

    def _commit_with_message(
        self, repo_root: Path, branch_name: str, message: str
    ) -> bool:
        try:
            subprocess.run(["git", "add", "-A"], cwd=repo_root, check=True)
            if not self._has_uncommitted_changes(repo_root):
                self.log("No changes detected after applying fixes; nothing to commit.")
                return False
            subprocess.run(
                ["git", "commit", "-m", message],
                cwd=repo_root,
                check=True,
            )
            subprocess.run(
                ["git", "push", "origin", branch_name],
                cwd=repo_root,
                check=True,
            )
            return True
        except subprocess.CalledProcessError as exc:
            self.log(f"Failed to commit/push comment fixes: {exc}")
            return False

    def _comment_on_pr(self, pr_number: int, message: str) -> None:
        if not self.token:
            self.log("Skipping PR comment because no token is configured.")
            return

        url = f"https://api.github.com/repos/{self.repo}/issues/{pr_number}/comments"
        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"token {self.token}",
        }
        try:
            response = requests.post(
                url,
                json={"body": message},
                headers=headers,
                timeout=10,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            self.log(f"Failed to post auto-fix comment to PR #{pr_number}: {exc}")

    def _create_pr(self, title: str, head: str, base: str, body: str) -> dict:
        """Create a pull request via the GitHub API and return its response."""

        url = f"https://api.github.com/repos/{self.repo}/pulls"
        headers = {"Accept": "application/vnd.github+json"}
        if self.token:
            headers["Authorization"] = f"token {self.token}"
        payload = {
            "title": title,
            "head": head,
            "base": base,
            "body": body,
            "draft": True,
        }
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        response.raise_for_status()
        return response.json()

    def _assign_reviewer(self, pr_number: int) -> None:
        """Request a review from the default reviewer."""

        url = f"https://api.github.com/repos/{self.repo}/pulls/{pr_number}/requested_reviewers"
        headers = {"Accept": "application/vnd.github+json"}
        if self.token:
            headers["Authorization"] = f"token {self.token}"
        payload = {"reviewers": [self.default_reviewer]}
        requests.post(url, json=payload, headers=headers, timeout=10)

    def enable_auto_merge(self, pr_number: int, merge_method: str = "SQUASH") -> None:
        """Enable GitHub auto-merge for the given pull request."""

        if not self.token:
            self.log("Skipping auto-merge enablement because no token is configured.")
            return

        node_id = self._get_pr_node_id(pr_number)
        if not node_id:
            self.log(
                f"Unable to determine node id for PR #{pr_number}; cannot enable auto-merge."
            )
            return

        method = merge_method.upper()
        query = (
            "mutation($pr:ID!,$method:PullRequestMergeMethod!)"
            "{ enablePullRequestAutoMerge("
            "input:{pullRequestId:$pr, mergeMethod:$method})"
            "{ clientMutationId }}"
        )
        payload = {"query": query, "variables": {"pr": node_id, "method": method}}
        headers = {
            "Authorization": f"token {self.token}",
            "Accept": "application/vnd.github+json",
        }
        try:
            response = requests.post(
                "https://api.github.com/graphql",
                json=payload,
                headers=headers,
                timeout=10,
            )
            response.raise_for_status()
            self.log(f"Enabled auto-merge for PR #{pr_number}")
        except requests.RequestException as exc:
            self.log(f"Failed to enable auto-merge for PR #{pr_number}: {exc}")

    def _get_pr_node_id(self, pr_number: int) -> Optional[str]:
        if not self.token:
            return None

        url = f"https://api.github.com/repos/{self.repo}/pulls/{pr_number}"
        headers = {
            "Authorization": f"token {self.token}",
            "Accept": "application/vnd.github+json",
        }
        try:
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            return response.json().get("node_id")
        except requests.RequestException as exc:
            self.log(f"Failed to fetch PR #{pr_number} metadata: {exc}")
            return None


if __name__ == "__main__":
    manager = AutomatedPullRequestManager("blackboxprogramming/blackroad")
    print("AutomatedPullRequestManager ready to manage pull requests.")
