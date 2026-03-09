# Test Coverage Analysis

## Executive Summary

The blackroad-prism-console monorepo contains **~5,000 source files** across Python and
JavaScript/TypeScript. There are currently **~623 test files** (158 Python + ~465 JS/TS),
but coverage is unevenly distributed. Many of the most critical subsystems — the agent
runtime, orchestrator core, CLI console, and several production services — have little to
no test coverage.

| Language | Source files | Test files | Approx. ratio |
|----------|-------------|------------|---------------|
| Python   | 1,969       | 332        | 1 test per ~6 source files |
| JS/TS    | 3,065       | 291        | 1 test per ~10.5 source files |

### Test type breakdown

| Type             | Python | JS/TS |
|------------------|--------|-------|
| Unit tests       | 150    | ~170  |
| Integration tests| 3      | ~8    |
| E2E tests        | 1      | ~11   |
| Fuzz / property  | 2      | ~2    |

---

## Priority 1 — Critical gaps (high risk, no/minimal tests)

### 1. `cli/console.py` — 2,649 lines, **zero tests**

This is the largest single Python source file in the project and serves as the primary
CLI entry point (`brc` / `blackroad-console`). It handles user-facing commands for
managing the entire platform. A regression here directly impacts every operator.

**Recommendation:** Add unit tests for each CLI command/subcommand, mocking external
dependencies. Focus on argument parsing, validation, and output formatting first.

### 2. `agent/` module — 26 files, **zero tests for 22 of them**

The agent subsystem (`daemon.py`, `runtime.py`, `store.py`, `api.py`, `telemetry.py`,
`models.py`, `transcribe.py`, `tts.py`, etc.) orchestrates the platform's autonomous
agents. `agent/api.py` alone is 864 lines, and `agent/store.py` is 627 lines.

**Recommendation:**
- `agent/store.py`: Unit tests for all CRUD operations and state transitions.
- `agent/api.py`: Integration tests for each API endpoint using a test client.
- `agent/runtime.py` / `agent/daemon.py`: Tests for lifecycle management (start, stop,
  restart, crash recovery).

### 3. `orchestrator/` — 28 files, **most untested**

Core orchestration logic including `consent.py` (645 lines), `memory.py`, `lineage.py`,
`redaction.py`, `sandbox.py`, `janitor.py`, `tenancy.py`, `protocols.py`, `settings.py`,
`tasks.py`, and `errors.py` have no tests.

**Recommendation:**
- `orchestrator/consent.py`: This is the consent-tracking subsystem (645 lines).
  Property-based tests with Hypothesis would be ideal for verifying consent propagation
  invariants.
- `orchestrator/router.py` (224 lines): Unit tests for route-matching and fallback logic.
- `orchestrator/memory.py`: Tests for memory allocation, eviction, and persistence.
- `orchestrator/redaction.py`: Critical for data privacy — test that PII is correctly
  redacted in all code paths.

### 4. `bots/` — 41 files, **~27 untested**

The bot subsystem includes complex domain bots:
- `supply_chain_management_bot.py` (665 lines)
- `quality_control_bot.py` (465 lines)
- `manufacturing_operations_bot.py` (418 lines)
- `manufacturing_integration_bot.py`, `merchandising_bot.py`, `plm_analysis_bot.py`

These encode significant business logic for manufacturing, supply chain, and quality
operations.

**Recommendation:** Unit tests for each bot's core decision-making methods. Integration
tests verifying bot-to-bot communication via the `bus.py` message bus.

### 5. `apps/backoffice/` — **308 source files, zero tests**

The entire backoffice React application — with pages for AI/ML operations, compliance,
datasets, monitoring, and deployment — has no test coverage whatsoever.

**Recommendation:** Start with component tests for the most critical pages
(AI_Assistants, AIOPS_Deploy, AIOPS_Monitor) and hooks (`usePolicyEvaluation`). Add
Playwright E2E tests for the admin workflow.

### 6. `apps/portals/` — **66 source files, zero tests**

The portals app includes API routes for chat, copilotkit, devops, PagerDuty integration,
risk scoring, and Unity config. These are production API endpoints with no tests.

**Recommendation:** Add API route tests (using Next.js test utilities or Supertest) for
each endpoint, especially the PagerDuty and risk/scorecard routes.

### 7. `packages/core/src/tradeos/` — Financial trading logic, **minimal tests**

The core trading package contains high-stakes financial logic:
- `allocator.ts` (88 lines) — Pro-rata/round-lot trade allocation with Decimal math
- `router.ts` (93 lines) — Asset-class routing (EQUITY, OPTION, BOND, CRYPTO)
- `bestex.ts` (92 lines) — Best execution venue scoring (multi-factor weighted algorithm)
- `errors.ts` (102 lines) — Trade error segregation with dual-approval and PnL computation

Bugs in financial math directly lead to monetary loss or regulatory violations.

**Recommendation:** Exhaustive unit tests with edge cases for Decimal precision, rounding
behavior, zero/negative quantities, and the four-eyes approval flow. Property-based tests
for allocation invariants (allocations sum to total, no negative positions).

### 8. `packages/core/src/recon/` — Reconciliation engine, **critical gap**

- `service.ts` (181 lines) — Daily reconciliation with break detection and SLA escalation
- `costBasis.ts` (132 lines) — FIFO/LIFO/SPEC_ID/AVERAGE cost basis lot matching
- `pure.ts` (181 lines) — Break detection with severity scoring (30-90 scale)

Cost basis calculation errors are a top SEC audit finding. This code must be
comprehensively tested.

**Recommendation:** Test every cost basis method against known hand-calculated examples.
Test break severity scoring at boundary values. Test SLA escalation timing.

### 9. `packages/core/src/surveillance/` — Fraud detection, **untested**

- `washTrade.ts` — Wash trade detection (O(n^2) matching, household grouping)
- `frontRun.ts` — Front-running detection (time-proximity analysis)
- `mixerProximity.ts` — Crypto mixer detection (graph traversal, risk scoring)

False negatives in surveillance = regulatory penalties. False positives = operational
burden. Both directions need testing.

**Recommendation:** Unit tests with known positive/negative scenarios for each detection
algorithm. Edge case tests for time window boundaries and threshold values.

### 10. `packages/core/src/reviews/engine.ts` — Compliance review, **untested**

Policy review aggregation (110 lines) with 5 possible outcomes
(AutoApproved/Approved/NeedsChanges/Escalated/Rejected), risk scoring, and breach
detection. WORM audit trail.

**Recommendation:** Test each outcome path, score aggregation logic, and breach
thresholds.

### 11. `packages/regdesk-core/` — Regulatory desk, **1 test for 10 source files**

- `delivery/engine.ts` — Document delivery with idempotency checks
- `gates/gatekeeper.ts` — Regulatory event gate evaluation with grace periods
- `orchestrator/filings.ts` — Regulatory filing orchestration

**Recommendation:** Test idempotency (duplicate delivery prevention), grace period date
math, and gate evaluation logic with boundary dates.

### 12. `apps/api/src/middleware/` — Security middleware, **untested**

- `rbac.ts` (27 lines) — Role hierarchy (viewer < member < admin < owner)
- `rate_limit.ts` (39 lines) — Token bucket rate limiting
- `dlp.ts` (18 lines) — Data Loss Prevention redaction

These are security boundaries. A bug in RBAC = privilege escalation. A bug in rate
limiting = DoS vulnerability.

**Recommendation:** Test role hierarchy edge cases, rate limit window boundaries, and DLP
regex patterns against real PII samples.

---

## Priority 2 — Significant gaps in partially-tested areas

### 13. `apps/api/` — 311 source files, only 8 tests

The main API service is severely undertested relative to its size. Key untested areas:
- `src/jobs/agent_worker.ts` (196 lines) — background job processing
- `src/lib/connectors/` — Jira, Salesforce, HubSpot, Linear integrations
- `src/lib/crypto.ts`, `src/lib/entitlements.ts`, `src/lib/keys/`
- 267 route files across CRM, AR, treasury, privacy, BCDR, SOC, and more

**Recommendation:** Unit tests for each connector (with mocked HTTP), tests for the job
worker state machine, and tests for cryptographic operations. Prioritize routes that
handle financial data (AR, treasury, revrec) and PII (privacy, DLP).

### 14. Production services with zero tests

| Service | Source files | Description |
|---------|-------------|-------------|
| `services/autopal/` | 14 | Automation platform — auth, ratelimit, config |
| `services/collab_bus/` | 6 | Collaboration message bus — storage (213 lines), server (161 lines) |
| `services/compliance_engine/` | 4 | Compliance policy evaluation — **security critical** |
| `services/discord-bot/` | 8 | Discord integration |
| `services/jetson_bridge/` | 5 | IoT/edge device integration |
| `services/materials_service/` | 3 | Materials data management |
| `services/model-health/` | 3 | ML model monitoring |

**Recommendation:** The `compliance_engine` and `collab_bus` services are the highest
priority here. The compliance engine evaluates security policies — any bug could mean a
compliance violation. `collab_bus` handles inter-service messaging, so message loss or
corruption bugs would cascade.

### 15. `packages/` with zero tests

| Package | Source files | Description |
|---------|-------------|-------------|
| `packages/policies/` | 10 | Policy definitions and evaluation |
| `packages/integrations/` | 11 | Third-party integrations |
| `packages/lucidia-create/` | 16 | Lucidia AI creation workflows |
| `packages/db/` | 6 | Database abstractions |
| `packages/flags/` | 4 | Feature flag system |
| `packages/ui/` | 4 | Shared UI components |
| `packages/blackroadctl/` | 36 src, 1 test | CLI management tool |

**Recommendation:** `packages/policies/` and `packages/db/` are foundational — bugs
propagate to all consumers. `packages/flags/` controls feature rollout and should have
exhaustive tests for flag evaluation logic.

---

## Priority 3 — Structural and infrastructure improvements

### 16. Integration test coverage is near zero

With only 3 Python integration tests and ~8 JS/TS integration tests across the entire
monorepo, cross-module interactions are almost entirely untested.

**Recommendation:**
- Add integration tests for the agent-to-orchestrator communication path.
- Add integration tests for the API → database → response cycle in `services/prism-console-api/`.
- Add contract tests between `apps/api` and its frontend consumers.

### 17. E2E test coverage is minimal

Only 1 Python E2E test and ~11 JS/TS E2E tests exist. For a platform this large, the E2E
suite should cover at least the critical user journeys.

**Recommendation:** Add Playwright E2E tests for:
- User authentication flow
- Agent creation and lifecycle
- Dashboard loading and data display
- Bot configuration and execution

### 18. No mutation testing

There is no mutation testing configured. Mutation testing reveals tests that pass but
don't actually verify behavior (i.e., tests that would still pass even if the code were
broken).

**Recommendation:** Integrate `mutmut` (Python) or `Stryker` (JS/TS) into CI for the
most critical packages to validate test effectiveness.

### 19. Property-based testing is underused

Only 2 fuzz/property test files exist. Given the mathematical and algorithmic nature of
many modules (quantum lab, Amundson equations, graph engines, diffusion engines), this is
a missed opportunity.

**Recommendation:** Expand Hypothesis usage to:
- `quantum_lab/core/` — circuit construction and measurement
- `orchestrator/consent.py` — consent state machine transitions
- `packages/graph-engines/` — graph algorithm invariants
- `packages/diffusion-engine/` — numerical stability properties

### 20. Coverage configuration is incomplete

The `pyproject.toml` coverage config only tracks `qlm_lab.tools.quantum_np` and
`quantum_lab.core.circuit`. The vast majority of Python source code is excluded from
coverage measurement.

**Recommendation:** Expand the `--cov` flag to include `agent`, `orchestrator`, `bots`,
`cli`, and `services`. Set a baseline coverage target (e.g., 50%) and ratchet it up over
time.

### 21. `pyproject.toml` has merge conflicts

The `pyproject.toml` file contains unresolved git merge conflict markers (`<<<<<<<`,
`>>>>>>>`). This means the Python test/build configuration is currently broken.

**Recommendation:** Resolve the merge conflicts in `pyproject.toml` immediately. This is
blocking accurate pytest collection and coverage reporting.

---

## Suggested action plan

| Phase | Scope | Effort |
|-------|-------|--------|
| **Phase 0** | Fix `pyproject.toml` merge conflicts, expand coverage config | Small |
| **Phase 1** | Tests for `packages/core/src/tradeos/` (allocator, router, bestex) and `recon/` (costBasis, pure, service) — highest regulatory risk | Medium |
| **Phase 2** | Tests for `packages/core/src/surveillance/` (wash trade, front-running) and `reviews/engine.ts` | Medium |
| **Phase 3** | Tests for `apps/api/src/middleware/` (RBAC, rate limit, DLP) and `packages/regdesk-core/` | Medium |
| **Phase 4** | Tests for `cli/console.py`, `agent/store.py`, `agent/api.py` | Medium |
| **Phase 5** | Tests for `orchestrator/consent.py`, `orchestrator/router.py`, `orchestrator/redaction.py` | Medium |
| **Phase 6** | Tests for untested bots (supply chain, quality control, manufacturing) | Medium |
| **Phase 7** | Tests for `apps/backoffice/`, `apps/portals/`, `apps/api/` routes and connectors | Large |
| **Phase 8** | Tests for `services/compliance_engine/`, `services/collab_bus/`, `services/autopal/` | Medium |
| **Phase 9** | Tests for `packages/policies/`, `packages/db/`, `packages/flags/` | Medium |
| **Phase 10** | Integration and E2E test suites for critical user journeys | Large |
| **Phase 11** | Property-based testing expansion (financial math, graph algorithms, consent state machines) | Medium |
| **Phase 12** | Mutation testing CI integration (`mutmut` for Python, `Stryker` for JS/TS) | Small |
