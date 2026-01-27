# Agent Checklist — BlackRoad Prism Console

## Purpose

Standard checklist for agents and developers before creating a PR. These commands are conservative and non-destructive.

## Pre-PR Steps

### 1. Bootstrap and Install Dependencies

```bash
# From repository root
bash ops/install.sh
```

This creates `.env` files, installs dependencies, and verifies runtime requirements.

### 2. Dependency Management

**NEVER manually edit `package.json` files.** If you added imports in a package:

```bash
# Run the dep-scan tool for the affected package and save changes
node tools/dep-scan.js --dir srv/blackroad-api --save

# Stage only the package files produced by the tool
git add package.json package-lock.json pnpm-lock.yaml
```

### 3. Run Tests and Lint

```bash
# API tests and lint
cd srv/blackroad-api
npm test
npm run lint

# Fix auto-fixable lint issues
npm run lint -- --fix
```

### 4. Runtime Verification (Optional but Recommended)

```bash
# From repository root
npm run health
bash tools/verify-runtime.sh
```

### 5. Environment Variables and Secrets

**Rules:**
- Do NOT rename or remove existing variables in `srv/blackroad-api/.env.example`
- If adding new variables, append them to `.env.example` with sensible defaults and comments
- NEVER commit secrets. If you find secrets, pause and notify a human reviewer

### 6. PR Metadata

**Commit conventions:**
- Use conventional commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
- Keep each branch a single conceptual change
- In the PR description, use the template from `.github/PULL_REQUEST_TEMPLATE.md`

## Quick Quality Gates

Run this fast CI-like check from repo root:

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Running quick quality gates..."

# Bootstrap
bash ops/install.sh

# Test and lint API
cd srv/blackroad-api
npm test --silent
npm run lint --silent
echo "✓ Tests and lint passed"
cd - >/dev/null

# Health check
npm run health || (echo "✗ Health check failed"; exit 2)

echo "✓ All quick checks passed"
```

Also available as: `bash scripts/quick_quality_gates.sh`

## Optional Smoke Tests

### Start API and Test Endpoints

```bash
# Terminal 1: Start API
cd srv/blackroad-api && npm run dev

# Terminal 2: Test health endpoints
curl -i http://localhost:4000/health
curl -i http://localhost:4000/api/health
```

### Verify LLM Bridge (if using LLM features)

```bash
# Check if LLM stub is reachable
curl -i http://127.0.0.1:8000/health
```

### Start Frontend

```bash
# From repository root
npm run dev:site

# Access at http://localhost:5173
```

## Standard Commands Reference

### Development Servers

```bash
# API server (port 4000)
cd srv/blackroad-api && npm run dev

# Frontend (port 5173)
npm run dev:site

# LLM bridge (port 8000)
cd srv/lucidia-llm && python -m uvicorn main:app --reload --port 8000
```

### Bot Operations (if applicable)

```bash
# List available bots
brc bot:list

# Create a task
brc task:create --goal "Your goal here"

# Route task to bot
brc task:route --id T0001 --bot "Treasury-BOT"

# Run full demo workflow
make demo
```

### Contract Validation (for deterministic workflows)

```bash
# Validate contracts
python scripts/validate_contracts.py

# Check artifact determinism
bash scripts/hash_artifacts.sh
```

## Key File References

- **API entry & middleware**: `srv/blackroad-api/server_full.js`
- **Environment variables**: `srv/blackroad-api/.env.example`
- **Bootstrap & dependencies**: `ops/install.sh`, `tools/dep-scan.js`, `tools/verify-runtime.sh`
- **Docker orchestration**: `docker-compose*.yml`
- **Automation & agents**: `codex/`, `scripts/`, `tools/`

## Port Allocation

- **3000**: Next.js frontend (alternative)
- **4000**: Express API (primary)
- **5173**: Vite dev server (primary frontend)
- **8000**: LLM stub service

## Helpful Tips

- Always use `git --no-pager` to avoid pager issues in scripts
- Use `DB_PATH=:memory:` for isolated test runs
- Set `NODE_ENV=test` for test environments
- Feature flags: `BILLING_DISABLE`, `ALLOW_SHELL`, etc.
- CORS origins: Set `ALLOW_ORIGINS` for local development

## CI/CD Notes

- Quick gates workflow runs on PRs: `.github/workflows/quick-gates.yml`
- Gitleaks automatically scans for secrets
- Codacy integration: Run `codacy_cli_analyze` after file edits
- All tests must pass before merge

---

**For detailed commands**: See `AGENT_CHECKLIST.md` (this file)
**For PR template**: See `.github/PULL_REQUEST_TEMPLATE.md`
**For architecture**: See `.github/copilot-instructions.md`

