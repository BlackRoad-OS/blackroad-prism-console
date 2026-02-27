from __future__ import annotations

import json
import os
import subprocess
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Optional

from agents.notification_bot import NotificationBot


@dataclass
class WebberBot:
    """Automate web file editing, formatting, and validation."""

    root_dir: str = field(default_factory=lambda: os.getcwd())

    def _run_prettier(self, file_path: str) -> None:
        """Run Prettier on ``file_path``, raising an error on failure."""
        try:
            subprocess.run(
                ["prettier", "--write", file_path],
                check=True,
                capture_output=True,
                text=True,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                "Prettier executable not found. Ensure Prettier is installed and on PATH."
            ) from exc
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip()
            stdout = (exc.stdout or "").strip()
            details = "\n".join(part for part in (stdout, stderr) if part)
            message = f"Prettier failed for {file_path}"
            if details:
                message = f"{message}:\n{details}"
            raise RuntimeError(message) from exc

    def format_html(self, file_path: str) -> None:
        """Format HTML file using Prettier (if installed)."""
        subprocess.run(["prettier", "--write", file_path], check=True)

    def format_css(self, file_path: str) -> None:
        """Format CSS file using Prettier."""
        subprocess.run(["prettier", "--write", file_path], check=True)

    def format_js(self, file_path: str) -> None:
        """Format JS file using Prettier."""
        subprocess.run(["prettier", "--write", file_path], check=True)
        """Format an HTML file using Prettier."""
        self._run_prettier(file_path)

    def format_css(self, file_path: str) -> None:
        """Format a CSS file using Prettier."""
        self._run_prettier(file_path)

    def format_js(self, file_path: str) -> None:
        """Format a JavaScript file using Prettier."""
        self._run_prettier(file_path)

    def validate_json(self, file_path: str) -> bool:
        """Validate JSON file syntax."""
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                json.load(f)
            print(f"{file_path} is valid JSON.")
            return True
        except Exception as e:  # noqa: BLE001
            print(f"JSON validation failed for {file_path}: {e}")
            return False

    def bulk_edit_html(self, search: str, replace: str) -> None:
        """Replace text in all HTML files under root_dir."""
    """Edit and validate web files, notifying on actions."""

    root_dir: str = field(default_factory=lambda: os.getcwd())
    notification_bot: Optional[NotificationBot] = None

    def _run_prettier(self, file_path: str) -> None:
        """Run Prettier on ``file_path`` and raise descriptive errors on failure."""
        try:
            subprocess.run(
                ["prettier", "--write", file_path],
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError as exc:  # pragma: no cover - runtime error path
            raise RuntimeError(f"Prettier failed for {file_path}: {exc.stderr.strip()}") from exc

    def format_html(self, file_path: str) -> None:
        """Format an HTML file using Prettier."""
        self._run_prettier(file_path)
    def _run_prettier(self, file_path: str) -> bool:
        """Run prettier on ``file_path`` and raise on failure."""
        try:
            subprocess.run(["prettier", "--write", file_path], check=True)
        except (subprocess.CalledProcessError, FileNotFoundError) as exc:
            raise RuntimeError(f"Prettier failed for {file_path}: {exc}") from exc
        return True

    def format_html(self, file_path: str) -> bool:
        """Format an HTML file using Prettier."""
        return self._run_prettier(file_path)

    def format_css(self, file_path: str) -> bool:
        """Format a CSS file using Prettier."""
        self._run_prettier(file_path)
        return self._run_prettier(file_path)

    def format_js(self, file_path: str) -> bool:
        """Format a JavaScript file using Prettier."""
        self._run_prettier(file_path)
        return self._run_prettier(file_path)

    def validate_json(self, file_path: str) -> bool:
        """Validate a JSON file, raising on failure."""
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                json.load(f)
        except Exception as exc:  # pylint: disable=broad-except
            raise ValueError(f"JSON validation failed for {file_path}: {exc}") from exc
        return True

    def bulk_edit_html(self, search: str, replace: str) -> None:
        """Replace ``search`` with ``replace`` in all HTML files under ``root_dir``."""
        for dirpath, _, filenames in os.walk(self.root_dir):
            for fname in filenames:
                if fname.endswith(".html"):
                    path = os.path.join(dirpath, fname)
                    with open(path, "r", encoding="utf-8") as f:
                        content = f.read()
                    new_content = content.replace(search, replace)
                    if new_content != content:
                        with open(path, "w", encoding="utf-8") as f:
                            f.write(new_content)
                        print(f"Edited {path}")

