# Test Coverage Analysis & Improvement Recommendations

**Date:** 2026-02-27
**Scope:** Full monorepo — apps, packages, agents, services, core modules

---

## Executive Summary

The BlackRoad Prism Console monorepo contains **~5,500 source files** across TypeScript, JavaScript, and Python, but only **~207 dedicated test files** (plus ~290 Python test files across agents). Effective coverage sits at roughly **3%**, far below the stated target of 70–80%. Beyond the raw numbers, many existing tests are **shallow** (status-code-only checks, existence assertions) or **completely skipped** (placeholder stubs). This analysis identifies the highest-impact areas where new or improved tests would most reduce risk.

---

## 1. Current State: Coverage by Area

| Area | Source Files | Test Files | Effective Coverage | Risk Level |
|------|-------------|------------|-------------------|------------|
| **apps/api/src/routes/** | **267** route files | 6 test files | **2.2%** (261 routes untested) | CRITICAL |
| **Authentication** (JWT, SAML, SCIM) | 8+ files | 0 dedicated tests | **0%** | CRITICAL |
| **agents/** (root-level) | **67** agent files | 3 test files | **4.5%** (64 agents untested) | HIGH |
| **agents/codex/** (sub-agents) | 7+ agent dirs | 26 test files | ~39% | MEDIUM |
| **services/** | **63** service dirs | 13 with tests | **20.6%** (50 services untested) | HIGH |
| **packages/** | **67** packages | 36 with tests | **53.7%** (31 packages untested) | HIGH |
| **apps/** | **37** app dirs | 11 with tests | **29.7%** (26 apps untested) | HIGH |
| **Event mesh / message bus** | 3+ core files | 1 minimal test | **~10%** | HIGH |
| **Database CRUD** | Multiple models | 1 integration test file | **<5%** | CRITICAL |
| **Core math** (hilbert, depth_solver) | 4 files (452 lines) | 2 partial tests | **~5–10%** functional | MEDIUM |
| **CLI tools** | 3+ apps | 0 tests | **0%** | LOW |
| **Frontend components** | 33 web apps | Sporadic | **<5%** | LOW |

### Detailed Breakdown: API Routes (Worst Coverage)

The `apps/api/src/routes/` directory contains **267 TypeScript route files** organized across dozens of domains. Only **6 test files** exist, leaving **98% of routes completely untested**. Major untested domains include:

| Domain | Route Files | Tests |
|--------|------------|-------|
| CRM (accounts, contacts, forecast, leads, opps, etc.) | 10 | 0 |
| AR (cashapp, credit, dispute, dunning, invoice, etc.) | 7 | 0 |
| AI (assistants, evals, experiments, prompts, rag, etc.) | 7 | 0 |
| HR (compensation, employee, onboarding, payroll, etc.) | 6+ | 0 |
| Treasury (cash, credit, hedges, market) | 4 | 0 |
| Tax (einvoice, fatca, jurisdictions) | 3 | 0 |
| SOX (deficiency, rcm, tests) | 3 | 0 |
| Auth (auth, saml/*, scim/*) | 6 | 0 |
| Billing, pricing, procurement, supply, etc. | 20+ | 0 |

### Detailed Breakdown: Root-Level Agents (64 Untested)

Of 67 Python agent files at the root `agents/` directory, only 3 have any test coverage (`auto_novel_agent.py`, `cleanup_bot.py`, `cusum_monitor_agent.py`). Notable untested agents:

- `athena_orchestrator.py` — Core orchestration logic
- `agent_wellness_system.py` — Health monitoring
- `blackroad_agent_framework.py` — Agent framework (both versions)
- `security_shepherd.py` — Security agent
- `multi_platform_orchestrator.py` — Multi-platform coordination
- `quantum_agent.py` — Quantum computing agent
- 57 more agents with zero tests

### Detailed Breakdown: Core Math Modules

| File | Lines | Tests | Functional Coverage |
|------|-------|-------|-------------------|
| `hilbert_core.py` | 186 | 1 test (only `ks_distance()`) | ~5% — 10+ functions untested including `normalize()`, `orthonormalize()`, `projector_from_basis()`, `truth_degree()`, `luders_update()`, full `SymbolicState` class |
| `depth_solver.py` | 105 | 0 | 0% — `depth_from_scalars()`, `solve()`, all helpers untested |
| `event_mesh.py` | 52 | 1 test (3 assertions) | ~30% |
| `prism_event_bridge.py` | 109 | 0 | 0% — `publish_event()`, `fetch_events()`, `wait_for_event()` all untested |

---

## 2. Critical Gaps (Immediate Action Needed)

### 2.1 Authentication & Authorization — 0% Coverage

**Why this matters:** Security vulnerabilities, unauthorized access, data breaches.

**Untested files:**
- `apps/api/src/routes/auth.ts` — Core auth endpoints
- `apps/api/src/routes/saml/acs.ts` — SAML assertion consumer
- `apps/api/src/routes/saml/metadata.ts` — SAML metadata
- `apps/api/src/routes/saml/slo.ts` — Single logout
- `apps/api/src/routes/scim/users.ts` — User provisioning
- `apps/api/src/routes/scim/groups.ts` — Group provisioning
- `srv/blackroad-api/routes/auth.js` — Legacy auth routes
- `services/auth/src/auth/routes/auth.py` — Python auth service

**Recommended tests:**
- JWT generation, validation, expiration, refresh-token rotation
- Password hashing verification
- SAML assertion signature verification and attribute mapping
- SCIM user provisioning/deprovisioning lifecycle
- Role-based access control enforcement
- Session fixation and token replay attack prevention

**Estimated effort:** 80–100 tests

---

### 2.2 Core API Endpoints — 2.2% Coverage (261 of 267 Routes Untested)

**Why this matters:** API failures and data corruption affect all consumers.

**What exists:** Only 6 test files for 267 route files. `apps/api/tests/unit/health.test.ts` checks only HTTP status codes (9 lines, 2 assertions). `apps/api/tests/integration/reco.test.ts` validates a single field (12 lines, 2 assertions). Both are effectively stubs.

**What's missing (261 untested routes including):**
- `apps/api/src/routes/billing.ts` — Stripe payment integration (0 tests)
- `apps/api/src/routes/treasury/*.ts` — Cash, credit, hedges, market (0 tests)
- `apps/api/src/routes/tax/*.ts` — E-invoicing, FATCA, jurisdictions (0 tests)
- `apps/api/src/routes/sox/*.ts` — Deficiency, RCM, compliance tests (0 tests)
- `apps/api/src/routes/crm/*.ts` — 10 CRM routes (0 tests)
- `apps/api/src/routes/ar/*.ts` — 7 accounts receivable routes (0 tests)
- `apps/api/src/routes/ai/*.ts` — 7 AI routes including rag, evals, safety (0 tests)
- `apps/api/src/routes/hr/*.ts` — Compensation, onboarding, payroll (0 tests)
- 200+ more route files with no tests at all

**Recommended tests:**
- Request validation (malformed input, missing fields, wrong types)
- Response schema validation (not just status codes)
- Authorization checks (401/403 for unauthorized requests)
- Error handling paths (500 scenarios, database down, timeouts)
- Pagination, filtering, sorting for list endpoints

**Estimated effort:** 200+ tests

---

### 2.3 Database Operations — <5% Coverage

**Why this matters:** Data loss, corruption, constraint violations.

**What exists:** `tests/integration/database/test_database_crud.py` (documented but may be a stub).

**What's missing:**
- Transaction rollback verification
- Concurrent write conflict handling
- Schema migration testing
- Foreign key constraint enforcement
- Bulk operation correctness
- Connection pool exhaustion handling

**Estimated effort:** 100+ tests

---

### 2.4 Agent Orchestration — ~2% Coverage

**Why this matters:** 100+ AI agents with virtually no automated verification of lifecycle, routing, or coordination.

**Untested:**
- `agents/athena_orchestrator.py` — Core orchestration logic
- `agents/agent_wellness_system.py` — Health monitoring
- Agent spawn/shutdown lifecycle state machine
- Task routing and capability matching
- Multi-agent coordination patterns (DELTA, HALO, LATTICE formations)
- Agent-to-agent message passing

**Estimated effort:** 150+ tests

---

### 2.5 Services Layer — 79% of Services Untested

**Why this matters:** 50 of 63 microservices have zero test files.

**Services with tests (13):** api-gateway, auth, llm, lucidia-cognitive-system, lucidia_api, origin-gateway, origin-qlm-bridge, policy-engine, prism, prism-console-api, quantum_copilot, roadglitch, roadview-search

**Notable untested services (50):** ai-content-generator, autopal, compliance_engine, discord-bot, finance-accounting-automation, hr-talent-automation, legal-compliance-automation, llm-gateway, llm-healthwatch, marketing-sales-automation, message-bus, metaverse-campus, model-health, operations-supply-chain, quantum_lab, reality-engine, roadchain, roadcoin, and 32 more.

### 2.6 Event Mesh & Message Bus — Minimal Coverage

**Why this matters:** Event loss, incorrect routing, silent failures in async processing.

**Untested files:**
- `prism_event_bridge.py` — 109 lines, 4 functions (`publish_event`, `fetch_events`, `wait_for_event`), 0 tests
- `agent/mac/mqtt.py` — MQTT pub/sub, 0 tests
- `event_mesh.py` — Has 1 minimal test (3 assertions for `github_webhook_to_event` only)

**Recommended tests:**
- Event routing logic (topic → handler mapping)
- MQTT pub/sub correctness
- Event normalization and schema validation
- Dead letter queue handling
- Back-pressure and overflow behavior

**Estimated effort:** 40+ tests

---

## 3. Quality Issues in Existing Tests

### 3.1 Broken Test Files

**`tests/backend-validation.test.js`** — Contains syntax errors, references to undefined functions (`getPort`, `callback`), and duplicate test definitions. This file **never executes successfully** and gives a false sense of coverage.

**Recommendation:** Fix or delete immediately. Broken tests are worse than no tests because they suppress real failures.

### 3.2 Entirely Skipped Test Suites

| File | Issue |
|------|-------|
| `apps/lucidia-desktop/tests/e2e/app.spec.ts` | All 4 tests use `test.skip()` with "scaffolding pending" |
| `apps/roadwork/tests/e2e/catalog.spec.ts` | Single test skipped |

**Recommendation:** Either implement these tests or remove the files. Skipped tests create noise and false confidence in CI dashboards.

### 3.3 Shallow / Happy-Path-Only Tests

| File | Issue |
|------|-------|
| `apps/api/tests/unit/health.test.ts` | Only checks HTTP status 200, no response body validation |
| `apps/api/tests/integration/reco.test.ts` | Binary assertion on one field |
| `apps/api/test/metrics.spec.ts` | `assert.ok(body.counters)` — truthy-only checks |
| `apps/roadwork/tests/unit/rateLimit.spec.ts` | No reset behavior, timing, or concurrent access tests |

**Recommendation:** Deepen these by adding error case tests, response schema validation, and boundary conditions.

### 3.4 Implementation-Coupled Tests

**`packages/chat-sdk/tests/client.sse.spec.ts`** directly accesses `FakeEventSource.instances` and asserts exact handler call counts. This breaks on any internal refactoring.

**Recommendation:** Refactor to test observable behavior (messages received, reconnection happening) rather than internal wiring.

---

## 4. High-Quality Tests to Use as Models

These existing tests demonstrate good patterns the team should follow:

| File | Why It's Good |
|------|---------------|
| `packages/core/test/recon.test.ts` | Tests multiple methods (FIFO, LIFO, AVERAGE), validates mathematical edge cases, realistic data |
| `apps/prism/server/test/runtime.test.ts` | Full lifecycle testing (create → update → complete), validates state transitions |
| `packages/core/test/rules.test.ts` | Boundary condition testing (300 vs 400 days), time-based edge cases |
| `packages/hjb-engine/tests/mdp.value_iteration.spec.ts` | Algorithm correctness validation with domain-specific assertions |
| `packages/diffusion-engine/tests/pde.mass_conservation.spec.ts` | Physical property invariant testing |
| `apps/backroad/tests/unit/safety.test.ts` | Multiple edge cases for PII and abuse detection |

---

## 5. Prioritized Improvement Plan

### Phase 1 — Highest Risk (Weeks 1–4)

| # | Area | Action | Est. Tests | Impact |
|---|------|--------|-----------|--------|
| 1 | Auth & Security | Write JWT, SAML, SCIM test suites | 80 | Prevents security breaches |
| 2 | Billing/Payments | Test Stripe integration, webhook verification | 30 | Prevents financial loss |
| 3 | Database CRUD | Integration tests for all entity operations | 100 | Prevents data corruption |
| 4 | Broken tests | Fix `backend-validation.test.js`, remove skipped stubs | — | Restores CI integrity |
| 5 | API route basics | Request validation + error cases for top 20 routes | 100 | Prevents API outages |

### Phase 2 — Core Business Logic (Weeks 5–8)

| # | Area | Action | Est. Tests | Impact |
|---|------|--------|-----------|--------|
| 6 | Agent orchestration | Lifecycle, routing, coordination tests | 100 | Prevents system instability |
| 7 | Event mesh | Pub/sub, routing, dead-letter tests | 40 | Prevents event loss |
| 8 | Treasury/Tax/SOX APIs | Business logic validation tests | 100 | Prevents compliance violations |
| 9 | Shallow test depth | Add error paths + schema validation to existing tests | 50 | Multiplies existing test value |

### Phase 3 — Broader Coverage (Weeks 9–16)

| # | Area | Action | Est. Tests | Impact |
|---|------|--------|-----------|--------|
| 10 | Individual agents | Unit tests for top 20 most-used agents | 100 | Prevents agent-specific failures |
| 11 | Package libraries | Public API tests for 57+ packages | 200 | Prevents library bugs |
| 12 | CLI tools | Command parsing, execution, error handling | 50 | Improves developer experience |
| 13 | Core math | hilbert_core, depth_solver, quantum algorithms | 80 | Prevents calculation errors |

### Phase 4 — System-Level (Weeks 17–24)

| # | Area | Action | Est. Tests | Impact |
|---|------|--------|-----------|--------|
| 14 | E2E workflows | 20 critical user journeys with Playwright | 50 | Catches integration regressions |
| 15 | Frontend components | React component tests for console web apps | 100 | Prevents UI regressions |
| 16 | Infrastructure | Terraform plan, K8s manifest, Docker build tests | 50 | Prevents deployment failures |

---

## 6. Infrastructure Recommendations

### 6.1 Fix the Root Vitest Config

`vitest.config.ts` currently contains **duplicate `defineConfig` blocks** (a syntax error). This should be fixed to a single valid configuration.

### 6.2 Enforce Coverage Thresholds in CI

Only `apps/api/jest.config.js` and `apps/backroad/vitest.config.ts` define coverage thresholds. All other packages run tests without coverage gates.

**Recommendation:** Add `coverageThreshold` to all Jest/Vitest configs, starting with:
- New code: 80% line coverage minimum
- Critical paths (auth, billing, DB): 90% minimum

### 6.3 Consolidate Test Runners

The repo uses both Jest and Vitest, sometimes in the same package. This creates confusion about which runner to use and duplicates configuration.

**Recommendation:** Standardize on Vitest for new TypeScript tests (faster, ESM-native, Vite-compatible). Keep Jest only for legacy packages that haven't migrated.

### 6.4 Add Coverage Reporting to CI

The `ci.yml` workflow runs `pytest --cov` but there's no equivalent coverage gate for the JavaScript/TypeScript side beyond the `attest-tests.yml` workflow.

**Recommendation:** Add Codecov or similar coverage tracking for both Python and JS/TS in the main CI pipeline, with a "no coverage decrease" gate on PRs.

---

## 7. Key Metrics

| Metric | Current | Target (12 weeks) | Target (24 weeks) |
|--------|---------|-------------------|-------------------|
| Overall coverage | ~3% | 30% | 70% |
| Test files | ~207 JS/TS + ~290 Python | +500 | +2,000 |
| Auth coverage | 0% | 90% | 95% |
| API route coverage | 15% | 60% | 85% |
| Agent coverage | 2% | 30% | 60% |
| Skipped/broken tests | 6+ files | 0 | 0 |
| Coverage gates in CI | 2 packages | All packages | All packages |

---

## 8. Conclusion

The three highest-leverage investments are:

1. **Authentication & payment tests** — The total absence of security-related tests is the single biggest risk in the codebase. Even a modest test suite here would dramatically reduce the probability of a security incident.

2. **Fix existing test infrastructure** — Broken test files, skipped suites, and a malformed vitest config undermine trust in the entire test pipeline. Cleaning these up is low effort and high impact.

3. **API route integration tests with schema validation** — Moving beyond status-code-only assertions to full request/response validation for the top 20 routes would catch the majority of regression bugs.

These three areas alone would take coverage from ~3% to roughly 25–30% on the most critical code paths, with the greatest reduction in production risk.
