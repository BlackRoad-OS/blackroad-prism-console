# CLAUDE.md — BlackRoad Prism Console

## Project Overview

BlackRoad Prism Console is a large-scale, hybrid monorepo combining a full-stack web application (Express.js backend + React/Vite frontend), 60+ microservices, 69+ shared packages, and advanced subsystems including AI agents, blockchain (Roadchain), cognitive systems (Lucidia), and quantum computing modules.

**Primary languages:** JavaScript/TypeScript (Node.js), Python 3.11+, Rust (packages)
**Runtime:** Node.js >= 20 (see `.nvmrc`)
**Module system:** CommonJS (backend `src/`), ESM (frontend, packages)

## Repository Layout

```
server_full.js          # Express.js API entry point (port 4000)
src/
  config.js             # Central env-var configuration
  db.js                 # SQLite (better-sqlite3) + auto-migrations
  auth.js               # JWT + session auth middleware
  routes/               # Express route modules (~28 route files)
  services/             # Backend business logic
  logger.js             # Logging (pino)
frontend/               # React 18 + Vite + Tailwind (port 5173)
  src/
    App.jsx             # Root component with React Router
    pages/              # Page-level components
    components/         # Shared UI components
apps/                   # Standalone applications (35+)
  prism-console-web/    # Next.js 14 dashboard (pnpm, Vitest, Playwright)
  prism/                # Prism sub-app (web + server)
  backroad/             # Backroad app (Vitest)
  lucidia-desktop/      # Desktop app
  ...
services/               # 60+ microservices
  prism-console-api/    # FastAPI backend (Python, Poetry)
  auth/                 # Auth service (Python)
  roadchain/            # Blockchain service
  lucidia-cognitive-system/
  llm-gateway/          # LLM routing
  api-gateway/          # API gateway (Vitest)
  ...
packages/               # 69+ shared packages
  diffusion-engine/     # Core engine (TS)
  diffusion-gateway/    # Gateway (TS)
  auth-sdk/             # Auth SDK (Vitest)
  core/                 # Core utilities (Vitest)
  hjb-engine/           # HJB engine (Jest)
  lucidia-geodesy/      # Geodesy (Rust crate)
  ...
db/migrations/          # SQLite migration SQL files (auto-applied on startup)
tests/                  # Test suite root
scripts/                # Automation and utility scripts
RUNBOOKS/               # Operational runbooks
DOCS/                   # Project documentation
.github/workflows/      # 460+ GitHub Actions workflows
docker-compose.yml      # Dev stack (api + frontend + redis + monitoring)
docker-compose.prod.yml # Production deployment
```

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start backend (Express API on :4000)
npm run dev

# Start frontend (Vite on :5173)
npm run frontend:dev

# Full stack via Docker
docker-compose up
```

## Build & Run Commands

| Command | Description |
|---|---|
| `npm start` | Start production server (`node server_full.js`) |
| `npm run dev` | Start dev server with nodemon |
| `npm run build` | Build Next.js app |
| `npm test` | Run Jest tests |
| `npm run test:jest` | Run Jest tests sequentially (`--runInBand`) |
| `npm run test:compliance` | Run Vitest compliance tests |
| `npm run test:api` | Run API smoke tests |
| `npm run test:db` | Run database tests |
| `npm run test:auth` | Run auth tests |
| `npm run lint` | ESLint (JS/JSX/MJS/CJS) |
| `npm run format` | Prettier format all files |
| `npm run format:check` | Check formatting without writing |
| `npm run typecheck` | TypeScript type check |
| `npm run frontend:dev` | Start Vite frontend dev server |
| `npm run frontend:build` | Build frontend for production |
| `npm run frontend:test` | Run frontend tests |
| `npm run site:dev` | Start marketing site dev server |
| `npm run seed` | Seed admin user |
| `npm run health` | Run health check script |

### Service-specific commands

- **prism-console-web** (in `apps/prism-console-web/`): `pnpm dev`, `pnpm test`, `pnpm test:e2e`, `pnpm storybook`
- **prism-console-api** (in `services/prism-console-api/`): `poetry install && poetry run uvicorn ...`, `poetry run pytest`
- **Packages with Jest** (e.g. `packages/hjb-engine/`): `npx jest` from package dir
- **Packages with Vitest** (e.g. `packages/core/`): `npx vitest run` from package dir

## Testing

### Test Frameworks

- **Jest** — Primary test runner for the backend and many packages. Config: `jest.config.js`
- **Vitest** — Used for compliance tests (root), packages (`packages/core/`, `packages/auth-sdk/`), and apps (`apps/prism-console-web/`). Config: `vitest.config.ts`
- **Cypress** — Frontend E2E tests in `frontend/cypress/`
- **Playwright** — E2E for `apps/prism-console-web/`
- **pytest** — Python tests for services. Config in each service's `pyproject.toml`
- **Supertest** — HTTP assertion in integration tests

### Test Structure

```
tests/
  jest.config.js        # Test-specific Jest config
  jest.setup.js         # Sets NODE_ENV=test, mocks better-sqlite3
  mocks/                # Shared mock implementations
  helpers/              # Test utilities
  integration/          # Integration tests
  compliance/           # Compliance/standards tests
  e2e/                  # End-to-end tests
  fuzz/                 # Fuzz tests
  golden/               # Golden file comparison tests
  agents/               # Agent-specific tests
  *.test.js             # Individual test files
```

### Running Tests

```bash
# All Jest tests
npm test

# Sequential (for tests with shared state)
npm run test:jest

# Compliance suite (Vitest)
npm run test:compliance

# Specific test suites
npm run test:api    # API smoke tests
npm run test:db     # Database tests
npm run test:auth   # Auth tests
```

### Test Environment

- `NODE_ENV` is set to `'test'` in `tests/jest.setup.js`
- `better-sqlite3` is mocked by default (see `tests/mocks/better-sqlite3.js`)
- Set `BR_TEST_DISABLE_DB=1` or `BRC_DISABLE_NATIVE_DB=1` to use mock DB outside tests
- Jest uses `forceExit: true` and outputs JUnit XML to `reports/junit.xml`

## Code Style & Formatting

### JavaScript/TypeScript

- **Prettier** — Single quotes, semicolons, trailing commas (es5), 80 char width. Config: `.prettierrc.json`
- **ESLint** — Warnings for `no-unused-vars` (with `_` prefix ignore) and `no-undef`. Config: `.eslintrc.cjs`
- **TypeScript** — Strict mode, ES2022 target, bundler module resolution. Config: `tsconfig.json`
- **Indentation** — 2 spaces (JS/TS/YAML), 4 spaces (Python). See `.editorconfig`
- **Line endings** — LF only

### Python

- **Ruff** — Linter, line-length 100, target py311, select E/F/I rules
- **Black** — Formatter (used in CI)
- **mypy** — Type checking (dev dependency in Python services)

### Pre-commit Hooks

Husky + lint-staged runs on every commit:
- `eslint --fix` + `prettier -w` for JS/TS files
- `prettier -w --ignore-unknown` for all other files

The pre-commit hook also runs `npm test`.

## Architecture

### Backend (Express.js)

The main API server (`server_full.js`) uses:
- **Express 4** with helmet, CORS, morgan logging, rate limiting (300 req/min)
- **Cookie sessions** (`brsid` cookie, 7-day TTL) + **JWT Bearer tokens**
- **SQLite** via better-sqlite3 with WAL mode and foreign keys
- **Socket.io** for real-time WebSocket communication (metrics streaming every 2s)

API routes are mounted under `/api/` via `src/routes/index.js`:
```
/health, /auth, /users, /agents, /wallet, /notes, /projects,
/tasks, /timeline, /contradictions, /logs, /commits, /metrics,
/dashboard, /llm, /lucidia, /pi, /roadbook, /deploy, /json,
/marketplace, /connect, /subscribe
```

### Frontend (React + Vite)

- React 18 with React Router v6 for client-side routing
- Tailwind CSS for styling
- Axios for API calls, Socket.io-client for real-time updates
- Recharts for data visualization
- Lucide React for icons

### Database

- **Engine:** SQLite 3 via `better-sqlite3` (synchronous API)
- **Location:** `DB_PATH` env var (default: `/srv/blackroad-api/blackroad.db`)
- **Migrations:** SQL files in `db/migrations/`, auto-applied on startup in lexical order
- **Migration naming:** `NNNN_description.sql` or `YYYYMMDDHHNN_description.sql`
- **Key tables:** users, agents, tasks, projects, notes, contradictions, wallets, sources, subscriptions, rc_ledger, rc_prices, schema_migrations, usage_events

### Authentication

- **Signup/Login:** `POST /api/auth/signup`, `POST /api/auth/login` — returns JWT token
- **Middleware:** `requireAuth` (validates session or Bearer token), `requireAdmin`, `requireRole()`
- **Password hashing:** bcrypt with 10 salt rounds
- **JWT:** Signed with `JWT_SECRET`, expires in 1 hour

### State Management

- **Frontend:** Zustand for client-side state
- **Backend:** In-memory services with SQLite persistence

## Path Aliases (TypeScript)

```
@/*                              → ./*
@blackroad/diffusion-engine/*    → packages/diffusion-engine/src/*
@blackroad/diffusion-gateway/*   → packages/diffusion-gateway/src/*
@br/qlm/*                       → frontend/src/lib/qlm/*
```

These are mirrored in `jest.config.js` via `moduleNameMapper`.

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `4000` | Express server port |
| `DB_PATH` | `/srv/blackroad-api/blackroad.db` | SQLite database path |
| `JWT_SECRET` | `change-this-jwt-secret` | JWT signing secret |
| `SESSION_SECRET` | `change-this-session-secret` | Cookie session secret |
| `ALLOWED_ORIGIN` | `null` | CORS allowed origin |
| `LUCIDIA_LLM_URL` | `http://127.0.0.1:8000` | LLM service URL |
| `ROADCHAIN_MODE` | `mock` | Blockchain mode (mock/live) |
| `ROADCHAIN_NETWORK` | `mocknet` | Chain network |
| `LOG_DIR` | `null` | Log file directory |
| `PRISM_API_PORT` | `4000` | Prism Console API port |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Frontend API URL |

See `.env.example` for the full list (~100+ variables across all services).

## Docker & Deployment

### Docker Compose profiles

- `docker-compose.yml` — Dev environment (api, frontend, redis, prometheus, grafana)
- `docker-compose.prod.yml` — Production (includes caddy, alertmanager, all services)
- `docker-compose.prism.yml` — Prism-specific services
- `docker-compose.site.yml` — Marketing site

### Production Deployment

Pushes to `main` trigger `00deploy.yml` which SSHs to a droplet and runs:
```bash
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

### Container Registry

Images are published to `ghcr.io/blackboxprogramming`.

## CI/CD

460+ GitHub Actions workflows in `.github/workflows/`. Key ones:

| Workflow | Trigger | Description |
|---|---|---|
| `ci.yml` | push/PR to main/master/staging/develop | Lint (ruff, black), Python tests, shell checks |
| `00deploy.yml` | push to main | Deploy to production droplet via SSH |
| `checks-ci.yml` | PR | Node.js CI checks |
| `ci-node-20.yml` | PR | Node 20 test matrix |
| `ci-python-312.yml` | PR | Python 3.12 tests |
| `commitlint.yml` | PR | Conventional commit validation |

Many workflows prefixed `_backup_132_` are archived/inactive.

## Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: Add new feature
fix: Fix a bug
chore: Maintenance task
docs: Documentation update
refactor: Code restructuring
test: Add or update tests
```

## Key Conventions for AI Assistants

1. **Module system matters.** Backend files under `src/` use CommonJS (`require`/`module.exports`). Frontend and packages use ESM (`import`/`export`). Check the nearest `package.json` for `"type"`.

2. **Database changes require migrations.** Never modify the schema directly — add a new `.sql` file in `db/migrations/` with the next sequence number. Migrations run automatically on server start.

3. **Auth middleware is required on protected routes.** Use `requireAuth` from `src/auth.js`. Admin-only routes use `requireAdmin`.

4. **Tests mock the database.** Jest setup mocks `better-sqlite3`. When writing backend tests, use the mock DB pattern from `tests/mocks/`.

5. **API responses follow a standard shape:** `{ ok: true, ...data }` for success, `{ ok: false, error: 'error_code' }` for errors with appropriate HTTP status codes.

6. **Environment-first configuration.** All config reads from `src/config.js` which pulls from `process.env` with sensible defaults. Never hardcode secrets or URLs.

7. **Lint before commit.** Husky pre-commit hooks run lint-staged automatically. Run `npm run lint` and `npm run format` before committing to avoid hook failures.

8. **Python services use Poetry.** Each Python service has its own `pyproject.toml`. Use `poetry install` and `poetry run pytest` within the service directory.

9. **Packages are independent.** Each package under `packages/` has its own test config (Jest or Vitest). Run tests from the package directory.

10. **Route files export an Express Router.** New routes go in `src/routes/<name>.js` and must be registered in `src/routes/index.js`.

11. **Do not commit `.env`, `*.db`, `*.pem`, `*.key`, or binary files.** The `.gitignore` blocks these. Check `.gitignore` if unsure.

12. **Node registry is public npm.** See `.npmrc` — all packages come from `registry.npmjs.org`.

## Troubleshooting

- **`better-sqlite3` build fails:** Requires Python 3, make, and g++ for native compilation. Use `BRC_DISABLE_NATIVE_DB=1` to fall back to mock DB for dev/test.
- **Port conflicts:** Default ports are 4000 (API), 5173 (Vite), 3000 (Next.js). Override via env vars.
- **Pre-commit hook fails:** Run `npm run lint` and `npm run format` manually, then retry commit.
- **Migration errors:** Check `db/migrations/` for conflicting filenames. The system skips "already exists" errors gracefully.
