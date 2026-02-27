# Test Coverage Analysis

> Analysis performed on 2026-02-27

## Executive Summary

The BlackRoad Prism Console monorepo has **significant test coverage gaps** across
all layers of the stack. While ~300 test files exist, they are concentrated in a
small subset of modules. The core backend (`src/`) is **~89% untested**, only
**18.6% of microservices** carry any tests, roughly **half the shared packages**
lack tests, and the **main frontend has zero component or unit tests**.

The sections below quantify the gaps, rank them by risk, and propose concrete
areas for improvement.

---

## 1. Core Backend (`src/`) — Coverage: ~11%

The main server contains **60+ source files** (routes, services, utilities, core
systems). Only **2 files** have dedicated tests; a handful receive indirect
coverage through integration tests.

### 1.1 Completely Untested Critical Files

| File | Size | Why It Matters |
|------|------|---------------|
| `src/LucidiaSystem.ts` | 32 KB | Main AI brain system — the largest and most complex module |
| `src/m2m.ts` | 31 KB | Machine-to-machine communication protocol |
| `src/db.js` | 8 KB | Database initialization and schema management |
| `src/socket.js` | ~1 KB | WebSocket connection handler |
| `src/rateLimiter.js` | ~0.2 KB | Security-critical rate limiting |
| `src/config.js` | 2 KB | Application configuration |
| `src/logger.js` | ~0.3 KB | Logging utility |

### 1.2 Untested Routes (28 total, 26 with no tests)

**High-risk routes (large/complex, handle money or user data):**

| Route | Size | Risk |
|-------|------|------|
| `routes/marketplace.js` | 35 KB | Financial transactions, seller/buyer flows |
| `routes/contradictions.js` | 22 KB | Complex AI logic |
| `routes/subscribe.js` | 12 KB | Subscription & billing |
| `routes/wallet.js` | 5.6 KB | Cryptocurrency operations |
| `routes/tasks.js` | 6.7 KB | Core CRUD (integration-only coverage) |
| `routes/agents.js` | 3.3 KB | Agent orchestration |
| `routes/deploy.js` | 1.5 KB | Deployment triggers |
| `routes/auth.js` | 1.9 KB | Authentication (integration-only coverage) |

### 1.3 Untested Services (all 8)

| Service | Size | Purpose |
|---------|------|---------|
| `services/dashboardService.js` | 7.0 KB | Dashboard data aggregation |
| `services/metricsService.js` | 5.2 KB | Metrics collection & reporting |
| `services/agentSummary.js` | 2.0 KB | Agent summary generation |
| `services/llmService.js` | ~1 KB | LLM integration |
| `services/autohealService.js` | 1.4 KB | Auto-healing logic |
| `services/connectorStore.js` | ~0.5 KB | Connector state management |
| `services/notifyService.js` | ~0.1 KB | Notification dispatch |
| `services/agentService.js` | ~0.1 KB | Agent management |

### 1.4 Untested Utilities

| Utility | Risk |
|---------|------|
| `src/upload.js` (4.3 KB) | File upload handling — injection/path-traversal risk |
| `src/crypto.js` | HMAC-SHA256 — correctness is critical |
| `src/validate.js` | Input validation |

---

## 2. Microservices (`services/`) — Coverage: 18.6%

Out of **59 microservices**, only **11 have any test files**. The remaining 48
have zero tests.

### 2.1 Services With Tests

| Service | Test Depth | Test Types |
|---------|-----------|------------|
| `auth` | Good | Unit, integration, contract (7 test files) |
| `prism-console-api` | Good | Integration, unit (12 test files) |
| `roadview-search` | Good | Unit (10 test files) |
| `llm` | Moderate | Unit (4 test files) |
| `api-gateway` | Moderate | Unit, E2E, contract (3 test files) |
| `roadglitch` | Moderate | Unit (6 test files) |
| `lucidia_api` | Minimal | Health only (2 test files) |
| `policy-engine` | Minimal | Unit (1 test file) |
| `origin-qlm-bridge` | Minimal | Health only (1 test file) |
| `prism` | Minimal | Integration (Go tests) |
| `origin-gateway` | Minimal | 1 test file |

### 2.2 Critical Untested Services

| Service | Source Files | Why It Matters |
|---------|-------------|---------------|
| `message-bus` | — | Core messaging infrastructure |
| `compliance_engine` | — | Regulatory compliance — legal risk |
| `finance-accounting-automation` | — | Financial operations |
| `hr-talent-automation` | — | HR data handling — PII risk |
| `legal-compliance-automation` | — | Legal compliance |
| `discord-bot` | 8 files | External-facing integration |
| `autopal` | 14 files | Large untested service |
| `quantum_copilot` | 12 files | Largest untested service |
| `llm-gateway` | — | LLM traffic routing |
| `llm-healthwatch` | — | LLM health monitoring |
| `lucidia-cognitive-system` | — | Core AI system |
| `reality-engine` | 5 files | Simulation engine |
| `roadchain` | — | Blockchain operations |
| `roadcoin` | — | Cryptocurrency operations |
| `stripe-webhook-adapter` | — | Payment webhook handling |
| `connectors` | — | Third-party integrations |
| `error-logger` | — | Error handling infrastructure |

---

## 3. Shared Packages (`packages/`) — Coverage: ~49%

Out of **68 packages**, roughly **34 have tests** and **34 have none**.

### 3.1 Well-Tested Packages

These packages have meaningful test suites:

- `core` — Domain types, rules, reconciliation (8 test files)
- `hjb-engine` — Hamilton-Jacobi-Bellman solver (5 test files)
- `graph-engines` — Graph algorithms (3+ test files)
- `diffusion-engine` — PDE/SDE solvers (3 test files)
- `ricci-engine` — Ricci flow (4 test files)
- `sb-engine` — Sinkhorn-based engine (3 test files)
- `ot-engine` — Optimal transport (2 test files)
- `adapters` — Data adapters (3 test files)
- `auth-sdk` — Authentication SDK (1 test file)
- `chat-sdk` — Chat SSE client (1 test file)

### 3.2 Critical Untested Packages

| Package | Why It Matters |
|---------|---------------|
| `db` | Database utilities — used across the monorepo |
| `config` | Shared configuration |
| `connectors` | Third-party integration connectors |
| `flags` | Feature flag management |
| `integrations` | Integration helpers |
| `policies` | Policy definitions |
| `jobs` | Job scheduling |
| `utils` | Shared utilities |
| `ui` | Shared UI components |
| `lucidia-core` | Core Lucidia AI library |
| `lucidia-create` | Lucidia creation module |
| `lucidia-geodesy` | Geodesy calculations |
| `provenance` | Data provenance tracking |
| `archival` | Data archival |
| `regdesk-db` | Registration desk database |
| `regdesk-rules` | Registration desk rules engine |
| `regdesk-integrations` | Registration desk integrations |
| `drafting` | Document drafting |

---

## 4. Frontend (`frontend/`) — Coverage: ~0%

The main frontend application has **zero unit or component tests**. It contains:

- **20 components** (`src/components/`) — none tested
- **35 pages** (`src/pages/`) — none tested
- **1 library** (`src/lib/qlm/`) — not tested
- **0 Cypress specs** — the Cypress directory exists but contains no test files

### 4.1 Critical Untested Frontend Areas

| Area | Files | Risk |
|------|-------|------|
| `components/StripeCheckout.jsx` | 1 | Payment flow — financial risk |
| `components/Login.jsx` | 1 | Authentication UI |
| `components/RoadCoin.jsx` | 1 | Cryptocurrency wallet UI |
| `components/RoadChain.jsx` | 1 | Blockchain interface |
| `pages/Marketplace.jsx` | 1 | E-commerce transactions |
| `pages/MarketplaceAdmin.jsx` | 1 | Admin operations |
| `pages/SellerDashboard.jsx` | 1 | Financial reporting |
| `pages/Dashboard.jsx` | 1 | Main user interface |
| `components/ErrorBoundary.tsx` | 1 | Error handling |
| `src/lib/qlm/` | dir | Quantum logic module |

### 4.2 App Frontends With Some Coverage

Some apps under `apps/` do have frontend tests, but coverage is still thin:

| App | Tests | Missing |
|-----|-------|---------|
| `apps/prism-console-web` | 9 test files | Most components untested |
| `apps/roadview` | 7 test files | Good a11y coverage, limited unit |
| `apps/roadwork` | 9 test files | Good structure, but gaps in pages |
| `apps/backroad` | 7 test files | Limited component coverage |
| `apps/lucidia-desktop` | 10 test files | Best app-level coverage |
| `apps/roadworld` | 6 test files | Unit tests for core logic |

---

## 5. Test Infrastructure Observations

### 5.1 Configuration Issues

- **Root `vitest.config.ts` has a syntax error**: duplicate `defineConfig` blocks
  concatenated in the same file (lines 1-15). This may cause the Vitest runner to
  fail silently.
- **Root `jest.config.js` has duplicate keys**: `setupFiles` and `testMatch` are
  each declared twice, with the second overriding the first. The first `testMatch`
  (supporting `.ts`/`.tsx`/`.mjs`) is overridden by `['**/*.test.js']`, excluding
  TypeScript tests.
- **No coverage thresholds configured**: Neither Jest nor Vitest configs enforce
  minimum coverage percentages.
- **No coverage collection enabled by default**: `collectCoverage` is not set in
  any root config.

### 5.2 Test Type Distribution

| Test Type | Count | Notes |
|-----------|-------|-------|
| Unit tests | ~150 | Concentrated in packages and agents |
| Integration tests | ~30 | Sparse, mostly in root `tests/` |
| E2E tests | ~15 | Several apps have Playwright/Cypress specs |
| Contract tests | ~10 | Good pattern in gateway packages |
| Accessibility tests | ~8 | Present in a few apps |
| Golden/snapshot tests | ~5 | Used in sites/blackroad |
| Fuzz tests | ~2 | Minimal |

---

## 6. Recommended Improvements (Prioritized)

### Priority 1 — Critical (Security, Financial, Data Integrity)

These areas carry the highest risk if bugs go undetected.

1. **`src/auth.js` + `src/rateLimiter.js` — Authentication & rate limiting**
   - Add unit tests for token validation, session handling, rate limit edge cases
   - Test auth bypass scenarios, expired tokens, malformed JWTs

2. **`src/db.js` — Database layer**
   - Test schema migrations, connection error handling, query edge cases
   - Test concurrent access patterns

3. **`routes/marketplace.js` (35 KB) — Financial transactions**
   - Test purchase flows, refund logic, seller payouts
   - Test input validation, price manipulation guards

4. **`routes/wallet.js` + `routes/roadcoin.js` — Cryptocurrency**
   - Test balance calculations, transfer validations
   - Test double-spend prevention

5. **`src/upload.js` — File uploads**
   - Test file type validation, size limits, path traversal prevention
   - Test malicious filename handling

6. **`services/compliance_engine` — Regulatory compliance**
   - Test rule evaluation, audit trail generation
   - Test edge cases in compliance checking

7. **`services/stripe-webhook-adapter` — Payment webhooks**
   - Test signature verification, idempotency, event handling
   - Test replay attack prevention

### Priority 2 — High (Core Functionality)

8. **`src/LucidiaSystem.ts` (32 KB) — AI brain system**
   - Extract testable units from this large module
   - Test state machine transitions, decision logic, error paths

9. **`src/m2m.ts` (31 KB) — Machine-to-machine protocol**
   - Test message serialization/deserialization
   - Test connection lifecycle, reconnection, error handling

10. **`src/socket.js` — WebSocket connections**
    - Test connection, disconnection, message handling
    - Test auth on socket connections

11. **`packages/db` — Shared database utilities**
    - Test query builders, connection pooling, error handling

12. **`packages/connectors` — Third-party integrations**
    - Test API client error handling, retry logic, data transformation

13. **`services/message-bus` — Messaging infrastructure**
    - Test message routing, delivery guarantees, dead letter handling

14. **`services/llm-gateway` + `services/llm-healthwatch` — LLM infrastructure**
    - Test request routing, fallback logic, health checks

### Priority 3 — Medium (User-Facing Quality)

15. **`frontend/src/components/` — All 20 React components**
    - Start with `Login.jsx`, `Dashboard.jsx`, `ErrorBoundary.tsx`
    - Add React Testing Library tests for render, interaction, and state

16. **`frontend/src/pages/` — All 35 pages**
    - Start with `Dashboard.jsx`, `Marketplace.jsx`, `RoadView.jsx`
    - Test routing, data loading, error states

17. **`frontend/cypress/` — E2E test suite**
    - Add specs for critical user journeys: login, dashboard, marketplace purchase
    - Currently has zero Cypress specs despite Cypress being installed

18. **`services/discord-bot` — External integration**
    - Test command parsing, message handling, error responses

19. **`services/autopal` (14 files) — Large untested service**
    - Add at minimum health check and core logic tests

### Priority 4 — Infrastructure & Quality

20. **Fix test configuration issues**
    - Fix the duplicate `defineConfig` in `vitest.config.ts`
    - Fix duplicate keys in `jest.config.js`
    - Enable coverage collection and set thresholds (target: 80%)

21. **Add coverage reporting to CI**
    - Integrate `jest --coverage` and `vitest --coverage` into CI pipeline
    - Fail builds when coverage drops below threshold

22. **Expand contract tests**
    - The gateway packages use contract tests well — extend this pattern to
      all service-to-service boundaries

23. **Add integration tests for `src/services/`**
    - All 8 service modules in `src/services/` are completely untested
    - `dashboardService.js` (7 KB) and `metricsService.js` (5.2 KB) are the most
      important

24. **Add fuzz testing for input-heavy routes**
    - `routes/marketplace.js`, `routes/subscribe.js`, `routes/agents.js`
    - Focus on JSON parsing, query parameter handling

---

## 7. Coverage by Area — Summary Table

| Area | Source Files | Files With Tests | Coverage % | Risk Level |
|------|-------------|-----------------|------------|------------|
| `src/` (core backend) | 60+ | 2 | ~3% | **CRITICAL** |
| `src/routes/` | 28 | 2 | ~7% | **CRITICAL** |
| `src/services/` | 8 | 0 | 0% | **HIGH** |
| `services/` (microservices) | 59 dirs | 11 | 18.6% | **HIGH** |
| `packages/` | 68 dirs | 34 | ~50% | **MEDIUM** |
| `frontend/` | 55+ files | 0 | 0% | **HIGH** |
| `apps/` | 36 dirs | ~12 | ~33% | **MEDIUM** |

---

## 8. Quick Wins

These are tests that would be relatively simple to add and would meaningfully
reduce risk:

1. **Health check tests for all services** — a simple HTTP GET to `/health` for
   each service ensures deployability (~1 hour of work for all 48 untested
   services).

2. **Smoke tests for all routes** — the existing `tests/smoke.test.mjs` pattern
   can be extended to cover all 28 routes (~2 hours).

3. **Schema validation tests for API contracts** — use the existing OpenAPI/JSON
   schema patterns from gateway packages (~1 day).

4. **Fix broken test configs** — the `vitest.config.ts` and `jest.config.js` bugs
   mean some existing tests may not be running (~30 minutes).

5. **Add `ErrorBoundary.tsx` tests** — this is the safety net for the entire
   frontend and is a single component (~30 minutes).
