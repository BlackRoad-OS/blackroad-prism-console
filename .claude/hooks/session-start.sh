#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# ── Node.js dependencies ───────────────────────────────────────────────
if [ -f package.json ]; then
  npm install
fi

# ── Python dependencies ────────────────────────────────────────────────
if command -v pip >/dev/null 2>&1; then
  # Always install core dev tools so linting and testing work
  pip install pytest ruff

  # requirements.txt has known conflicting version pins; install what we can
  if [ -f requirements.txt ]; then
    pip install -r requirements.txt || echo "pip: some packages failed (check requirements.txt for conflicts)"
  fi
  if [ -f pyproject.toml ]; then
    pip install -e ".[dev]" 2>/dev/null || echo "pip: editable install skipped (pyproject.toml may need cleanup)"
  fi
fi
