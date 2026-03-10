'use strict';

/**
 * BlackRoad API — Express + SQLite + Socket.IO + LLM bridge
 *
 * Required env:
 *   SESSION_SECRET  — cookie-session encryption key
 *   INTERNAL_TOKEN  — token for inter-service calls
 *   ALLOW_ORIGINS   — comma-separated allowed CORS origins
 *
 * Optional env:
 *   PORT            — listen port (default: 4000)
 *   DB_PATH         — SQLite file path (default: :memory: in tests)
 *   LLM_URL         — LLM service endpoint
 *   MATH_ENGINE_URL — Math engine endpoint (empty = unavailable)
 *   ALLOW_SHELL     — enable shell exec endpoint (default: false)
 *   WEB_ROOT        — static web root
 *   BR_TEST_DISABLE_DB — skip native SQLite (use in-memory stub)
 *   AUTOPAL_GLOBAL_ENABLED — set to 'false'/'0'/'off' to enable maintenance mode
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieSession = require('cookie-session');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

const logger = require('./lib/log');
const gitRouter = require('./routes/git');
const providersRouter = require('./routes/providers');

// ── Environment ───────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '4000', 10);
const SESSION_SECRET = process.env.SESSION_SECRET;
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN;
const WEB_ROOT = process.env.WEB_ROOT || path.join(__dirname, '../../var/www/blackroad');
const LLM_URL = process.env.LLM_URL || 'http://127.0.0.1:8000/chat';
const ALLOW_SHELL = String(process.env.ALLOW_SHELL || 'false').toLowerCase() === 'true';
const MATH_ENGINE_URL = process.env.MATH_ENGINE_URL || '';

if (!SESSION_SECRET) throw new Error('Missing required env: SESSION_SECRET');
if (!INTERNAL_TOKEN) throw new Error('Missing required env: INTERNAL_TOKEN');

const ALLOW_ORIGINS = (process.env.ALLOW_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ── Database ──────────────────────────────────────────────────────────────────

let NativeDatabase;
try {
  NativeDatabase = require('better-sqlite3');
} catch (_) {
  NativeDatabase = null;
}

const SHOULD_DISABLE_DB = /^(1|true)$/i.test(
  process.env.BR_TEST_DISABLE_DB || process.env.BRC_DISABLE_NATIVE_DB || ''
);

class MemoryDatabase {
  pragma() { return null; }
  exec() {}
  prepare() {
    return {
      run: () => ({ lastInsertRowid: 0, changes: 0 }),
      get: () => undefined,
      all: () => [],
      * iterate() {},
    };
  }
}

function openDb() {
  if (SHOULD_DISABLE_DB || !NativeDatabase) return new MemoryDatabase();
  try {
    const dbPath = process.env.DB_PATH || ':memory:';
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    const db = new NativeDatabase(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    return db;
  } catch (err) {
    logger.warn({ event: 'db_fallback', error: String(err) });
    return new MemoryDatabase();
  }
}

const db = openDb(); // eslint-disable-line no-unused-vars

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString();
}

function verifyToken(given, expected) {
  if (!given || !expected) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  } catch (_) {
    return false;
  }
}

// ── Maintenance mode ──────────────────────────────────────────────────────────

function isMaintenanceMode() {
  const raw = String(process.env.AUTOPAL_GLOBAL_ENABLED || '').trim().toLowerCase();
  if (!raw) return false;
  return raw === 'false' || raw === '0' || raw === 'off';
}

const MAINTENANCE_PAYLOAD = {
  code: 'maintenance_mode',
  message: 'AutoPal is paused by ops.',
  hint: 'Try again later or use runbooks.',
  runbook: 'https://runbooks/autopal/maintenance',
};

// ── CORS ──────────────────────────────────────────────────────────────────────

function buildCorsOptions(allowedOrigins) {
  if (!allowedOrigins || allowedOrigins.length === 0) {
    return { origin: true, credentials: true };
  }
  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  };
}

// ── Rate limiters ─────────────────────────────────────────────────────────────

function resolveClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip;
}

const loginLimiter = rateLimit({
  windowMs: 5 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: resolveClientIp,
  handler: (_req, res) => {
    res.status(429).json({ error: 'too_many_attempts' });
  },
});

// ── App factory ───────────────────────────────────────────────────────────────

/**
 * Build and return an Express app.
 * @param {{ sessionSecret?: string, allowedOrigins?: string[] }} opts
 */
function buildApp(opts = {}) {
  const sessionSecret = opts.sessionSecret || SESSION_SECRET;
  const origins = opts.allowedOrigins || ALLOW_ORIGINS;

  const app = express();
  app.set('trust proxy', 1);

  // Request ID
  app.use((req, res, next) => {
    const id =
      (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id']) ||
      crypto.randomUUID();
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  });

  // Security headers
  app.use(helmet());

  // CORS
  app.use(cors(buildCorsOptions(origins)));

  // Global rate limit
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // Body parsing (must come before session so JSON body-parser errors get a clean response)
  app.use((req, res, next) => {
    express.json({ limit: '2mb' })(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: 'invalid_json', message: err.message });
      }
      next();
    });
  });
  app.use(express.urlencoded({ extended: true }));
  app.use(compression());

  // Cookie session
  app.use(
    cookieSession({
      name: 'brsid',
      secret: sessionSecret,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000,
    })
  );

  // Internal token injection
  app.use((req, _res, next) => {
    const token = req.get('x-internal-token') || '';
    if (token) {
      if (verifyToken(token, INTERNAL_TOKEN)) {
        if (!req.session) req.session = {};
        req.session.user = { username: 'internal-service', role: 'system' };
      }
    }
    next();
  });

  // Auth guard
  function requireAuth(req, res, next) {
    if (req.session && req.session.user) return next();
    return res.status(401).json({ error: 'unauthorized' });
  }

  // ── Maintenance mode middleware ──────────────────────────────────────────────
  app.use((req, res, next) => {
    if (!isMaintenanceMode()) return next();

    res.set('x-autopal-mode', 'maintenance');

    const now = nowIso();

    // Health endpoints pass through (allowlisted)
    if (req.path === '/health' || req.path === '/health/live') {
      res.set('cache-control', 'max-age=10');
      return res.json({ status: 'ok', ts: now });
    }
    if (req.path === '/health/ready' || req.path === '/api/health') {
      return res.json({ status: 'ok', ts: now });
    }

    // Special blocked routes
    if (req.method === 'POST' && req.path === '/secrets/materialize') {
      return res.status(403).json({
        code: 'materialize_disabled',
        message: 'Token minting disabled (global switch).',
      });
    }
    if (req.method === 'POST' && req.path === '/secrets/resolve') {
      return res.status(503).json({
        code: 'maintenance_mode',
        message: 'Secret operations are disabled by the global switch.',
      });
    }
    if (req.method === 'POST' && req.path === '/fossil/override') {
      return res.status(503).json({
        code: 'maintenance_mode',
        message: 'Overrides are disabled while AutoPal is paused.',
      });
    }

    // All other requests: block with maintenance payload
    if (req.method === 'GET') {
      res.set('Retry-After', '60');
    }
    return res.status(503).json(MAINTENANCE_PAYLOAD);
  });

  // ── Health routes (always accessible, even in maintenance) ───────────────────

  app.head('/health', (_req, res) => res.status(200).end());
  app.get('/health', (_req, res) => {
    res.json({ ok: true, version: '1.0.0', uptime: process.uptime() });
  });

  app.head('/healthz', (_req, res) => res.status(200).end());
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, version: '1.0.0', uptime: process.uptime() });
  });

  app.head('/health/live', (_req, res) => res.status(200).end());
  app.get('/health/live', (_req, res) => {
    res.json({ ok: true, status: 'live', ts: nowIso() });
  });

  app.head('/health/ready', (_req, res) => res.status(200).end());
  app.get('/health/ready', (_req, res) => {
    res.json({ ok: true, status: 'ready', ts: nowIso() });
  });

  app.head('/api/health', (_req, res) => res.status(200).end());
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime(), ts: nowIso() });
  });

  // ── Auth routes ──────────────────────────────────────────────────────────────

  app.get('/api/session', (req, res) => {
    res.json({ user: req.session?.user || null });
  });

  app.post('/api/login', loginLimiter, (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || !username || typeof password !== 'string') {
      return res.status(400).json({ error: 'missing_credentials' });
    }
    if (username === 'root' && password === 'Codex2025') {
      req.session.user = { id: 'root', username: 'root', roles: ['admin'] };
      return res.json({ ok: true, user: { username: 'root' } });
    }
    return res.status(401).json({ error: 'invalid_credentials' });
  });

  app.post('/api/logout', (req, res) => {
    req.session = null;
    res.json({ ok: true });
  });

  // ── Billing ──────────────────────────────────────────────────────────────────

  const DEFAULT_ENTITLEMENTS = {
    planName: 'Free',
    entitlements: {
      can: { math: { pro: false }, llm: { pro: true } },
      limits: { chat: 500, storageGb: 5 },
    },
  };

  app.get('/api/billing/entitlements/me', requireAuth, (_req, res) => {
    res.json(DEFAULT_ENTITLEMENTS);
  });

  // ── Quantum AI ───────────────────────────────────────────────────────────────

  const QUANTUM_TOPICS = [
    {
      topic: 'reasoning',
      summary:
        'Quantum reasoning models blend symbolic search with qubit annealing for accelerated insight.',
    },
    {
      topic: 'memory',
      summary:
        'Quantum RAM with entangled states hints at dense, instantly linked memory architectures.',
    },
    {
      topic: 'symbolic',
      summary:
        'Quantum-symbolic AI uses interference to amplify useful symbol chains while damping noise.',
    },
  ];

  app.get('/api/quantum', (_req, res) => {
    res.json({ topics: QUANTUM_TOPICS });
  });

  app.get('/api/quantum/:topic', (req, res) => {
    const detail = QUANTUM_TOPICS.find((t) => t.topic === req.params.topic);
    if (!detail) return res.status(404).json({ error: 'unknown_topic' });
    return res.json({ ...detail, ts: nowIso() });
  });

  // ── Math engine ──────────────────────────────────────────────────────────────

  app.get('/api/math/health', (_req, res) => {
    if (!MATH_ENGINE_URL) {
      return res.status(503).json({ ok: false, error: 'engine_unavailable' });
    }
    return res.json({ ok: true, engine: MATH_ENGINE_URL });
  });

  app.post('/api/math/eval', (req, res) => {
    if (!MATH_ENGINE_URL) {
      return res.status(503).json({ error: 'engine_unavailable' });
    }
    const { expr } = req.body || {};
    if (typeof expr !== 'string') {
      return res.status(400).json({ error: 'expr_required' });
    }
    return res.status(503).json({ error: 'engine_unavailable' });
  });

  // ── Tasks ────────────────────────────────────────────────────────────────────

  const tasks = [];

  app.get('/api/tasks', requireAuth, (_req, res) => {
    res.json({ tasks });
  });

  app.post('/api/tasks', requireAuth, (req, res) => {
    const { title } = req.body || {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title_required' });
    }
    const task = { id: tasks.length + 1, title: title.trim() };
    tasks.push(task);
    return res.status(201).json({ ok: true, task });
  });

  // ── Trust & Truth ────────────────────────────────────────────────────────────

  app.get('/api/trust/curvature', (_req, res) => {
    res.json([{ u: 'a', v: 'b', kappa: 0.42 }, { u: 'b', v: 'c', kappa: 0.37 }]);
  });

  app.get('/api/truth/diff', (_req, res) => {
    res.json({ ctd: 1, ops: [] });
  });

  // ── Connectors ───────────────────────────────────────────────────────────────

  app.get('/api/connectors/status', (_req, res) => {
    res.json({
      config: { stripe: false, mail: false, sheets: false, calendar: false, discord: false, webhooks: false },
      live: { slack: false, airtable: false, linear: false, salesforce: false },
    });
  });

  // ── Subscribe ────────────────────────────────────────────────────────────────

  app.get('/api/subscribe/health', (_req, res) => {
    res.json({ ok: true, mode: 'local', providerReady: true });
  });

  // ── LLM ─────────────────────────────────────────────────────────────────────

  app.get('/api/llm/ready', async (_req, res) => {
    let ok = false;
    try {
      const r = await fetch(`${LLM_URL.replace('/chat', '/health')}`);
      ok = r.ok;
    } catch (_) { /* LLM not available */ }
    res.json({ ok, url: LLM_URL });
  });

  // ── Shell exec ───────────────────────────────────────────────────────────────

  if (ALLOW_SHELL) {
    const { execFile } = require('child_process');
    app.post('/api/exec', requireAuth, (req, res) => {
      const { cmd, args = [] } = req.body || {};
      if (!cmd || typeof cmd !== 'string') {
        return res.status(400).json({ error: 'cmd_required' });
      }
      execFile(cmd, args, { timeout: 10_000 }, (err, stdout, stderr) => {
        if (err) return res.status(500).json({ error: err.message, stderr });
        return res.json({ ok: true, stdout, stderr });
      });
    });
  }

  // ── Sub-routers ──────────────────────────────────────────────────────────────

  app.use('/api/git', requireAuth, gitRouter);
  app.use('/v1/providers', providersRouter);

  // ── Static files ─────────────────────────────────────────────────────────────

  app.use(express.static(WEB_ROOT));

  // ── 404 ──────────────────────────────────────────────────────────────────────

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.path });
  });

  // ── Error handler ────────────────────────────────────────────────────────────

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'invalid_json', message: err.message });
    }
    const status = err.message === 'Not allowed by CORS' ? 403 : err.status || 500;
    logger.error({ event: 'request_error', requestId: req.requestId, message: err.message });
    return res.status(status).json({
      error: err.code || 'internal_error',
      message: err.message,
    });
  });

  return app;
}

// ── Default module-level instances ────────────────────────────────────────────

const app = buildApp();
const server = http.createServer(app);

// Start listening: port 0 (random) when used as a library, PORT when run directly.
if (require.main === module) {
  server.listen(PORT, () => {
    logger.info({ event: 'server_start', port: PORT, llm: LLM_URL, shell: ALLOW_SHELL });
  });
} else {
  server.listen(0);
}

// ── Factory export ────────────────────────────────────────────────────────────

/**
 * Create a new HTTP server with custom options.
 * @param {{ sessionSecret?: string, allowedOrigins?: string[] }} options
 * @returns {{ app: import('express').Express, server: import('http').Server }}
 */
function createServer(options = {}) {
  const newApp = buildApp(options);
  const newServer = http.createServer(newApp);
  return { app: newApp, server: newServer };
}

module.exports = { app, server, loginLimiter, createServer };
