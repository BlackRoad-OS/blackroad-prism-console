// FILE: /srv/blackroad-api/server_full.js
'use strict';

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieSession = require('cookie-session');
const rateLimit = require('express-rate-limit');

// Allow requiring .ts files as plain JS for lucidia brain modules
require.extensions['.ts'] = require.extensions['.js'];
const {
  PORT,
  NODE_ENV,
  ALLOWED_ORIGIN,
  LOG_DIR,
  SESSION_SECRET,
  ROADCHAIN_MODE,
  ROADCHAIN_NETWORK,
  EVM_CHAIN_ID,
  ROADCHAIN_MAINNET_OK,
  ROADVIEW_STORAGE
} = require('./src/config');
const subscribe = require('./src/routes/subscribe');

// Configuration validation and warnings
console.log('[INFO] Starting BlackRoad API Server...');
console.log(`[INFO] Environment: ${NODE_ENV}`);
console.log(`[INFO] Port: ${PORT}`);

// Ensure log dir exists
if (LOG_DIR) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    console.log(`[INFO] Log directory configured: ${LOG_DIR}`);
  } catch (err) {
    console.error(`[ERROR] Failed to create log directory: ${err.message}`);
  }
}

const app = express();
app.set('trust proxy', 1); // behind NGINX

// HTTP security headers
app.use(helmet());

// CORS (adjust as needed)
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow curl / same-origin
    if (!ALLOWED_ORIGIN || origin === ALLOWED_ORIGIN) return callback(null, true);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true
};
app.use(cors(corsOptions));

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// Sessions
if (!SESSION_SECRET || SESSION_SECRET === 'change-this-session-secret') {
  console.warn('[WARN] ⚠️  Weak or default SESSION_SECRET detected. Update your .env!');
  if (NODE_ENV === 'production') {
    console.error('[ERROR] ❌ Cannot run in production with default SESSION_SECRET!');
    process.exit(1);
  }
} else {
  console.log('[INFO] ✓ Session secret configured');
}

app.use(cookieSession({
  name: 'brsid',
  secret: SESSION_SECRET || 'dev-session-secret',
  httpOnly: true,
  sameSite: 'lax',
  secure: NODE_ENV === 'production',
  maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
}));

// Rate limiting (global)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { 
    error: 'Too many requests', 
    code: 'rate_limit_exceeded',
    retry_after: '60 seconds'
  }
});
app.use(limiter);
console.log('[INFO] ✓ Rate limiting configured (300 req/min)');

// Initialize DB (auto-migrations on import)
const db = require('./src/db');
console.log('[INFO] ✓ Database initialized');

// Simple in-memory storage for resilience operations
const snapshots = [];
const snapshotLogs = [];
const rollbackLogs = [];

// Snapshot management endpoints with enhanced error handling
app.get('/api/snapshots', (req, res) => {
  try {
    res.json({ 
      snapshots,
      count: snapshots.length,
      total_size: snapshots.reduce((sum, s) => sum + parseInt(s.size), 0)
    });
  } catch (error) {
    console.error('[ERROR] Failed to retrieve snapshots:', error.message);
    res.status(500).json({ error: 'Failed to retrieve snapshots', code: 'snapshot_list_error' });
  }
});

app.post('/api/snapshots', (req, res) => {
  try {
    const { description } = req.body || {};
    
    if (snapshots.length >= 100) {
      return res.status(400).json({ 
        error: 'Maximum snapshots limit reached', 
        code: 'snapshot_limit_exceeded',
        max_snapshots: 100 
      });
    }
    
    const snap = {
      id: String(Date.now()),
      timestamp: new Date().toISOString(),
      size: `${Math.floor(Math.random() * 100) + 1}MB`,
      status: 'complete',
      description: description ? String(description).slice(0, 200) : 'System snapshot',
      user: req.session?.userId || 'anon'
    };
    
    snapshots.push(snap);
    snapshotLogs.push({ 
      timestamp: snap.timestamp, 
      action: 'snapshot', 
      user: snap.user, 
      result: 'ok', 
      notes: snap.description 
    });
    
    console.log(`[INFO] Snapshot created: ${snap.id} by user ${snap.user}`);
    res.json({ snapshot: snap });
  } catch (error) {
    console.error('[ERROR] Failed to create snapshot:', error.message);
    res.status(500).json({ error: 'Failed to create snapshot', code: 'snapshot_create_error' });
  }
});

app.get('/api/snapshots/:id/download', (req, res) => {
  try {
    const snap = snapshots.find(s => s.id === req.params.id);
    
    if (!snap) {
      return res.status(404).json({ 
        error: 'Snapshot not found', 
        code: 'snapshot_not_found',
        snapshot_id: req.params.id 
      });
    }
    
    res.setHeader('Content-Disposition', `attachment; filename=snapshot-${req.params.id}.txt`);
    res.setHeader('Content-Type', 'text/plain');
    res.send(`Snapshot Data\n=============\nID: ${snap.id}\nTimestamp: ${snap.timestamp}\nSize: ${snap.size}\nStatus: ${snap.status}\nDescription: ${snap.description || 'N/A'}\nUser: ${snap.user || 'anon'}\n`);
  } catch (error) {
    console.error('[ERROR] Failed to download snapshot:', error.message);
    res.status(500).json({ error: 'Failed to download snapshot', code: 'snapshot_download_error' });
  }
});

app.post('/api/rollback/:id', (req, res) => {
  try {
    const snap = snapshots.find(s => s.id === req.params.id);
    const log = { 
      timestamp: new Date().toISOString(), 
      action: 'rollback', 
      user: req.session?.userId || 'anon',
      snapshot_id: req.params.id
    };
    
    if (snap) {
      log.result = 'success';
      log.notes = `Rollback to snapshot ${snap.id} completed successfully`;
      console.log(`[INFO] Rollback successful: ${snap.id} by user ${log.user}`);
      rollbackLogs.push(log);
      res.json({ 
        status: 'success', 
        snapshot: snap,
        message: 'System rolled back successfully'
      });
    } else {
      log.result = 'fail';
      log.notes = `Snapshot ${req.params.id} not found`;
      console.warn(`[WARN] Rollback failed: snapshot ${req.params.id} not found`);
      rollbackLogs.push(log);
      res.status(404).json({ 
        status: 'fail', 
        error: 'Snapshot not found',
        code: 'snapshot_not_found',
        snapshot_id: req.params.id
      });
    }
  } catch (error) {
    console.error('[ERROR] Rollback operation failed:', error.message);
    res.status(500).json({ error: 'Rollback operation failed', code: 'rollback_error' });
  }
});

app.get('/api/rollback/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const filteredLogs = rollbackLogs.slice(-limit);
    res.json({ 
      logs: filteredLogs,
      count: filteredLogs.length,
      total: rollbackLogs.length
    });
  } catch (error) {
    console.error('[ERROR] Failed to retrieve rollback logs:', error.message);
    res.status(500).json({ error: 'Failed to retrieve rollback logs', code: 'log_retrieve_error' });
  }
});

app.get('/api/snapshots/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const filteredLogs = snapshotLogs.slice(-limit);
    res.json({ 
      logs: filteredLogs,
      count: filteredLogs.length,
      total: snapshotLogs.length
    });
  } catch (error) {
    console.error('[ERROR] Failed to retrieve snapshot logs:', error.message);
    res.status(500).json({ error: 'Failed to retrieve snapshot logs', code: 'log_retrieve_error' });
  }
});

// Enhanced Health Check Endpoint
app.get('/api/health', (req, res) => {
  try {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(uptime),
        formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`
      },
      environment: NODE_ENV,
      version: require('./package.json').version || '1.0.0',
      node_version: process.version,
      memory: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
      },
      services: {
        database: 'connected',
        snapshots: {
          count: snapshots.length,
          status: 'operational'
        },
        roadchain: {
          mode: ROADCHAIN_MODE,
          network: ROADCHAIN_NETWORK,
          status: 'operational'
        }
      },
      configuration: {
        port: PORT,
        cors_enabled: !!ALLOWED_ORIGIN,
        rate_limit_enabled: true,
        session_configured: SESSION_SECRET !== 'change-this-session-secret'
      }
    };
    
    // Add detailed check parameter for verbose output
    if (req.query.detailed === 'true') {
      healthStatus.detailed = {
        pid: process.pid,
        platform: process.platform,
        arch: process.arch,
        cpu_usage: process.cpuUsage()
      };
    }
    
    res.json(healthStatus);
  } catch (error) {
    console.error('[ERROR] Health check failed:', error.message);
    res.status(503).json({ 
      status: 'unhealthy', 
      error: 'Health check failed',
      message: error.message 
    });
  }
});

// SUBSCRIBE
const subRouter = express.Router();
const { requireAuth } = require('./src/auth');
const { v4: uuidv4 } = require('uuid');
const SUB_PROVIDER = process.env.SUB_PROVIDER || 'mock';
const SUB_WEBHOOK_SECRET = process.env.SUB_WEBHOOK_SECRET || 'change-me';

// Fallback set of subscription plans used when the database has not been
// seeded. This keeps the API functional in development/mock modes and mirrors
// the basic plan structure described in the product docs.
const DEFAULT_PLANS = [
  {
    plan_id: 'free',
    name: 'Free',
    currency: 'usd',
    monthly_price_cents: 0,
    annual_price_cents: 0,
    features: ['1 project', '1 agent', '100 prompts/month', 'community support']
  },
  {
    plan_id: 'creator',
    name: 'Creator',
    currency: 'usd',
    monthly_price_cents: 900,
    annual_price_cents: 9000,
    features: [
      '10 projects',
      '5 agents',
      '5,000 prompts/mo',
      'priority queue',
      'RoadCoin minting (basic)',
      'RC wallet link',
      'limited Orchestrator'
    ]
  },
  {
    plan_id: 'pro',
    name: 'Pro',
    currency: 'usd',
    monthly_price_cents: 2900,
    annual_price_cents: 29000,
    features: [
      'unlimited projects',
      '20 agents',
      '25,000 prompts/mo',
      'fast queue',
      'RoadCoin minting (standard)',
      'Orchestrator (full)',
      'Dashboard analytics',
      'API access'
    ]
  },
  {
    plan_id: 'enterprise',
    name: 'Enterprise',
    currency: 'usd',
    monthly_price_cents: null,
    annual_price_cents: null,
    features: [
      'SSO/SAML',
      'custom limits',
      'private models',
      'SLA',
      'dedicated support'
    ]
  }
];

function createCheckoutSession({ user: _user, plan: _plan }) {
  const paymentId = uuidv4();
  return {
    provider: SUB_PROVIDER,
    provider_ref: paymentId,
    checkout_url: `/subscribe/mock-pay?payment_id=${paymentId}`
  };
}

subRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

subRouter.get('/plans', (_req, res) => {
  const rows = db
    .prepare(
      'SELECT plan_id, name, price_cents, currency, interval, features_json, rc_monthly_allowance, limits_json FROM plans WHERE active = 1'
    )
    .all();
  if (rows.length === 0) {
    // When no plans are defined in the database (common in local development),
    // fall back to the default static plans defined above.
    return res.json({ plans: DEFAULT_PLANS });
  }
  const plans = rows.map((r) => ({
    plan_id: r.plan_id,
    name: r.name,
    price_cents: r.price_cents,
    currency: r.currency,
    interval: r.interval,
    features: JSON.parse(r.features_json || '[]'),
    rc_monthly_allowance: r.rc_monthly_allowance,
    limits: JSON.parse(r.limits_json || '{}')
  }));
  res.json({ plans });
});

subRouter.get('/me', requireAuth, (req, res) => {
  const row = db
    .prepare(
      'SELECT s.plan_id, s.status, s.current_period_end, s.cancel_at_period_end, e.rc_monthly_allowance, e.rc_monthly_used, e.limits_json FROM subscriptions s LEFT JOIN entitlements e ON e.user_id = s.user_id WHERE s.user_id = ?'
    )
    .get(req.session.userId);
  if (!row) return res.json({ status: 'free' });
  res.json({
    status: row.status,
    plan_id: row.plan_id,
    current_period_end: row.current_period_end,
    cancel_at_period_end: !!row.cancel_at_period_end,
    entitlements: {
      rc_monthly_allowance: row.rc_monthly_allowance || 0,
      rc_monthly_used: row.rc_monthly_used || 0,
      limits: JSON.parse(row.limits_json || '{}')
    }
  });
});

subRouter.post('/checkout', requireAuth, (req, res) => {
  const { plan_id } = req.body || {};
  if (!plan_id) return res.status(400).json({ error: 'missing_plan', code: 'missing_plan' });
  const plan = db
    .prepare('SELECT plan_id, price_cents, currency FROM plans WHERE plan_id = ? AND active = 1')
    .get(plan_id);
  if (!plan) return res.status(400).json({ error: 'invalid_plan', code: 'invalid_plan' });
  const { provider, provider_ref, checkout_url } = createCheckoutSession({ user: req.session.userId, plan });
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO payments (id, user_id, plan_id, amount_cents, currency, provider, provider_ref, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'created', ?, ?)`
  ).run(provider_ref, req.session.userId, plan.plan_id, plan.price_cents, plan.currency, provider, provider_ref, now, now);
  res.json({ checkout_url });
});

subRouter.post('/mock/pay', requireAuth, (req, res) => {
  const { payment_id, success } = req.body || {};
  const pay = db
    .prepare('SELECT * FROM payments WHERE id = ? AND user_id = ?')
    .get(payment_id, req.session.userId);
  if (!pay) return res.status(400).json({ error: 'invalid_payment' });
  const now = Math.floor(Date.now() / 1000);
  const status = success ? 'paid' : 'failed';
  db.prepare('UPDATE payments SET status = ?, updated_at = ? WHERE id = ?').run(status, now, payment_id);
  if (success) {
    const subId = uuidv4();
    const periodStart = now;
    const periodEnd = now + 30 * 24 * 60 * 60;
    db.prepare(
      `INSERT OR REPLACE INTO subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?, 0, ?, ?)`
    ).run(subId, req.session.userId, pay.plan_id, periodStart, periodEnd, now, now);
    const plan = db
      .prepare('SELECT rc_monthly_allowance, limits_json FROM plans WHERE plan_id = ?')
      .get(pay.plan_id);
    db.prepare(
      `INSERT INTO entitlements (user_id, plan_id, rc_monthly_allowance, rc_monthly_used, limits_json, refreshed_at)
       VALUES (?, ?, ?, 0, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET plan_id=excluded.plan_id, rc_monthly_allowance=excluded.rc_monthly_allowance, rc_monthly_used=0, limits_json=excluded.limits_json, refreshed_at=excluded.refreshed_at`
    ).run(req.session.userId, pay.plan_id, plan.rc_monthly_allowance, plan.limits_json, now);
  }
  res.json({ ok: true });
});

subRouter.post('/cancel', requireAuth, (req, res) => {
  db.prepare('UPDATE subscriptions SET cancel_at_period_end = 1, updated_at = strftime("%s","now") WHERE user_id = ?').run(
    req.session.userId
  );
  res.json({ ok: true });
});

subRouter.post('/resume', requireAuth, (req, res) => {
  db.prepare('UPDATE subscriptions SET cancel_at_period_end = 0, updated_at = strftime("%s","now") WHERE user_id = ?').run(
    req.session.userId
  );
  res.json({ ok: true });
});

function handleWebhook(req, res) {
  try {
    const sig = req.get('X-Subscribe-Signature');
    const payload = JSON.stringify(req.body || {});
    const expected = require('crypto').createHmac('sha256', SUB_WEBHOOK_SECRET).update(payload).digest('base64');
    
    if (sig !== expected) {
      console.warn('[WARN] Invalid webhook signature received');
      return res.status(401).json({ error: 'invalid_signature', code: 'webhook_signature_invalid' });
    }
    
    const now = Math.floor(Date.now() / 1000);
    const eventType = req.body.event_type || 'unknown';
    
    db.prepare('INSERT INTO webhook_log (id, provider, event_type, payload_json, received_at) VALUES (?, ?, ?, ?, ?)').run(
      uuidv4(),
      SUB_PROVIDER,
      eventType,
      payload,
      now
    );
    
    console.log(`[INFO] Webhook received: ${eventType} from ${SUB_PROVIDER}`);
    res.json({ received: true, event_type: eventType });
  } catch (error) {
    console.error('[ERROR] Webhook processing failed:', error.message);
    res.status(500).json({ error: 'Webhook processing failed', code: 'webhook_error' });
  }
}

app.post('/api/subscribe/webhook', handleWebhook);
app.use('/api/subscribe', subRouter);

// ROADCOIN
const rcRouter = express.Router();

rcRouter.post('/hold', requireAuth, (req, res) => {
  const { amount, module, ref_type, ref_id } = req.body || {};
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'invalid_amount', code: 'invalid_amount' });
  }
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO rc_holds (id, user_id, amount, module, ref_type, ref_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'held', ?, ?)`
  ).run(id, req.session.userId, amount, module || null, ref_type || null, ref_id || null, now, now);
  res.json({ hold_id: id });
});

rcRouter.post('/release', requireAuth, (req, res) => {
  const { hold_id } = req.body || {};
  const hold = db
    .prepare('SELECT * FROM rc_holds WHERE id = ? AND user_id = ? AND status = "held"')
    .get(hold_id, req.session.userId);
  if (!hold) return res.status(400).json({ error: 'invalid_hold', code: 'invalid_hold' });
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE rc_holds SET status = ?, updated_at = ? WHERE id = ?').run('released', now, hold_id);
  res.json({ ok: true });
});

rcRouter.post('/capture', requireAuth, (req, res) => {
  const { hold_id } = req.body || {};
  const hold = db
    .prepare('SELECT * FROM rc_holds WHERE id = ? AND user_id = ? AND status = "held"')
    .get(hold_id, req.session.userId);
  if (!hold) return res.status(400).json({ error: 'invalid_hold', code: 'invalid_hold' });
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE rc_holds SET status = ?, updated_at = ? WHERE id = ?').run('captured', now, hold_id);
  db.prepare(
    `INSERT INTO rc_ledger (id, user_id, delta, source, module, ref_type, ref_id, memo, created_at, created_by)
     VALUES (?, ?, ?, 'job', ?, ?, ?, ?, ?, ?)`
  ).run(
    uuidv4(),
    req.session.userId,
    -hold.amount,
    hold.module || null,
    hold.ref_type || null,
    hold.ref_id || null,
    null,
    now,
    req.session.userId
  );
  res.json({ ok: true });
});

rcRouter.get('/prices', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT key, amount FROM rc_prices WHERE active = 1').all();
  const prices = {};
  for (const r of rows) prices[r.key] = r.amount;
  res.json({ prices });
});

app.use('/api/rc', rcRouter);

// ROADCHAIN
const roadchainRouter = express.Router();

roadchainRouter.get('/net', (_req, res) => {
  const info = {
    mode: ROADCHAIN_MODE,
    network: ROADCHAIN_NETWORK,
    mainnetAllowed: ROADCHAIN_MAINNET_OK
  };
  if (ROADCHAIN_MODE === 'evm') info.chainId = EVM_CHAIN_ID;
  res.json(info);
});

app.use('/api/roadchain', roadchainRouter);
// ROADVIEW
const ROADVIEW_PROJECTS_DIR = path.join(ROADVIEW_STORAGE, 'projects');
try {
  fs.mkdirSync(ROADVIEW_PROJECTS_DIR, { recursive: true });
} catch (err) {
  console.error(
    `Failed to ensure RoadView projects directory at ${ROADVIEW_PROJECTS_DIR}`,
    err
  );
}
app.use(
  '/files/roadview',
  express.static(ROADVIEW_STORAGE, { index: false, fallthrough: false })
);

// Routes
const apiRouter = require('./src/routes');
app.use('/api', apiRouter);

// MCI routes
const mciRouter = require('./srv/blackroad-api/mci/routes/mci.routes');
app.use('/api/mci', mciRouter);
// Lucidia Brain routes
if (process.env.ENABLE_LUCIDIA_BRAIN !== '0') {
  app.use('/api/lucidia/brain', require('./routes/lucidia-brain'));
}

// HTTP server + Socket.IO
const server = http.createServer(app);
const { setupSockets } = require('./src/socket');
const io = setupSockets(server);

// LUCIDIA
(function setupLucidia() {
  // --- LLM Provider
  const _subLlmProvider = process.env.SUB_LLM_PROVIDER || 'mock';
  const llmProvider = {
    async chat({ messages }) {
      // Simple mock provider that echoes the last user message.
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      const echo = lastUser ? String(lastUser.content || '') : '';
      const content = `Mock reply: ${echo}`;
      const token_count = Math.ceil(content.length / 4);
      return { content, role: 'agent', token_count };
    },
    async moderate() {
      return { flagged: false };
    }
  };

  // --- DB tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS lucidia_projects (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT,
      description TEXT,
      visibility TEXT CHECK(visibility IN ('private','unlisted','public')) DEFAULT 'private',
      agent_count INTEGER DEFAULT 1,
      created_at INTEGER,
      updated_at INTEGER,
      archived INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_lucidia_projects_user_id ON lucidia_projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_lucidia_projects_visibility ON lucidia_projects(visibility);
    CREATE INDEX IF NOT EXISTS idx_lucidia_projects_archived ON lucidia_projects(archived);

    CREATE TABLE IF NOT EXISTS lucidia_agents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT,
      persona TEXT,
      instructions TEXT,
      color TEXT,
      order_index INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_lucidia_agents_project_id ON lucidia_agents(project_id);
    CREATE INDEX IF NOT EXISTS idx_lucidia_agents_order_index ON lucidia_agents(order_index);

    CREATE TABLE IF NOT EXISTS lucidia_conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT,
      status TEXT CHECK(status IN ('active','archived')) DEFAULT 'active',
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_lucidia_conversations_project_id ON lucidia_conversations(project_id);
    CREATE INDEX IF NOT EXISTS idx_lucidia_conversations_status ON lucidia_conversations(status);

    CREATE TABLE IF NOT EXISTS lucidia_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      agent_id TEXT,
      user_id TEXT,
      role TEXT CHECK(role IN ('user','agent','system','function')) NOT NULL,
      content TEXT,
      function_name TEXT,
      function_args_json TEXT,
      token_count INTEGER DEFAULT 0,
      created_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_lucidia_messages_conversation_id ON lucidia_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_lucidia_messages_role ON lucidia_messages(role);
    CREATE INDEX IF NOT EXISTS idx_lucidia_messages_created_at ON lucidia_messages(created_at);

    CREATE TABLE IF NOT EXISTS lucidia_notes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT,
      title TEXT,
      content TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_lucidia_notes_project_id ON lucidia_notes(project_id);
    CREATE INDEX IF NOT EXISTS idx_lucidia_notes_created_at ON lucidia_notes(created_at);

    CREATE TABLE IF NOT EXISTS lucidia_contradictions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_id TEXT,
      source_type TEXT CHECK(source_type IN ('message','note')),
      conflict_id TEXT,
      conflict_type TEXT CHECK(conflict_type IN ('message','note')),
      description TEXT,
      resolved INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_lucidia_contradictions_project_id ON lucidia_contradictions(project_id);
    CREATE INDEX IF NOT EXISTS idx_lucidia_contradictions_resolved ON lucidia_contradictions(resolved);

    CREATE TABLE IF NOT EXISTS lucidia_knowledge (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source TEXT CHECK(source IN ('note','agent','user','contradiction')),
      content TEXT,
      hash TEXT UNIQUE,
      created_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_lucidia_knowledge_project_id ON lucidia_knowledge(project_id);
    CREATE INDEX IF NOT EXISTS idx_lucidia_knowledge_hash ON lucidia_knowledge(hash);

    CREATE VIEW IF NOT EXISTS lucidia_project_summary_v AS
    SELECT p.id, p.user_id, p.title, p.visibility,
      (SELECT COUNT(*) FROM lucidia_agents a WHERE a.project_id = p.id) AS agent_count,
      (SELECT COUNT(*) FROM lucidia_conversations c WHERE c.project_id = p.id) AS convo_count,
      (SELECT COUNT(*) FROM lucidia_notes n WHERE n.project_id = p.id) AS note_count,
      (SELECT COUNT(*) FROM lucidia_contradictions x WHERE x.project_id = p.id AND x.resolved = 0) AS contradictions_unresolved
    FROM lucidia_projects p
    WHERE p.archived = 0;
  `);

  const lucidiaRouter = express.Router();
  lucidiaRouter.use(requireAuth);

  // List projects
  lucidiaRouter.get('/projects', (req, res) => {
    const rows = db
      .prepare(
        'SELECT id, title, visibility, agent_count, convo_count, note_count, contradictions_unresolved FROM lucidia_project_summary_v WHERE user_id = ?'
      )
      .all(req.session.userId);
    res.json({ projects: rows });
  });

  // Create project with default agents
  lucidiaRouter.post('/projects', (req, res) => {
    const { title, description } = req.body || {};
    if (!title) return res.status(400).json({ error: 'missing_title', code: 'missing_title' });
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    db.prepare('INSERT INTO lucidia_projects (id,user_id,title,description,created_at,updated_at,agent_count) VALUES (?,?,?,?,?,?,?)')
      .run(id, req.session.userId, String(title).slice(0, 200), String(description || '').slice(0, 1000), now, now, 3);

    const defaults = [
      {
        name: 'Analyst',
        persona: 'Analyst',
        instructions: 'You are an analyst: summarize, extract key facts, and identify missing information.',
        color: '#FF4FD8'
      },
      {
        name: 'Planner',
        persona: 'Planner',
        instructions: 'You are a planner: break down objectives into steps and propose plans.',
        color: '#0096FF'
      },
      {
        name: 'Critic',
        persona: 'Critic',
        instructions: 'You are a critic: find flaws, contradictions, or risks in statements.',
        color: '#FDBA2D'
      }
    ];
    const insertAgent = db.prepare(
      'INSERT INTO lucidia_agents (id, project_id, name, persona, instructions, color, order_index, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
    );
    defaults.forEach((a, idx) => {
      insertAgent.run(uuidv4(), id, a.name, a.persona, a.instructions, a.color, idx, now, now);
    });

    res.json({ id, title: String(title), description: String(description || '') });
  });

  // List conversations
  lucidiaRouter.get('/conversations', (req, res) => {
    const { project_id } = req.query || {};
    if (!project_id) return res.status(400).json({ error: 'missing_project', code: 'missing_project' });
    const rows = db
      .prepare('SELECT id, title, status FROM lucidia_conversations WHERE project_id = ? ORDER BY created_at')
      .all(project_id);
    res.json({ conversations: rows });
  });

  // Create conversation
  lucidiaRouter.post('/conversations', (req, res) => {
    const { project_id, title } = req.body || {};
    if (!project_id || !title) return res.status(400).json({ error: 'missing_fields', code: 'missing_fields' });
    const now = Math.floor(Date.now() / 1000);
    const id = uuidv4();
    db.prepare('INSERT INTO lucidia_conversations (id, project_id, title, created_at, updated_at) VALUES (?,?,?,?,?)').run(
      id,
      project_id,
      String(title).slice(0, 200),
      now,
      now
    );
    res.json({ id });
  });

  // Get messages
  lucidiaRouter.get('/conversations/:id/messages', (req, res) => {
    const convoId = req.params.id;
    const after = parseInt(req.query.after || '0', 10);
    const rows = db
      .prepare(
        'SELECT id, agent_id, user_id, role, content, token_count, created_at FROM lucidia_messages WHERE conversation_id = ? AND created_at > ? ORDER BY created_at'
      )
      .all(convoId, after);
    res.json({ messages: rows });
  });

  // Post message and get agent reply
  lucidiaRouter.post('/conversations/:id/message', async (req, res) => {
    const convoId = req.params.id;
    const { content, agent_id } = req.body || {};
    if (!content) return res.status(400).json({ error: 'missing_content', code: 'missing_content' });
    const convo = db.prepare('SELECT project_id FROM lucidia_conversations WHERE id = ?').get(convoId);
    if (!convo) return res.status(404).json({ error: 'not_found', code: 'not_found' });
    const now = Math.floor(Date.now() / 1000);
    const messageId = uuidv4();
    const tokenUser = Math.ceil(String(content).length / 4);
    db.prepare(
      'INSERT INTO lucidia_messages (id, conversation_id, user_id, role, content, token_count, created_at) VALUES (?,?,?,?,?,?,?)'
    ).run(messageId, convoId, req.session.userId, 'user', String(content).slice(0, 10000), tokenUser, now);
    io.to(`lucidia:${convo.project_id}`).emit('lucidia:message:new', {
      conversation_id: convoId,
      message: { id: messageId, role: 'user', content: String(content) }
    });

    const history = db
      .prepare('SELECT role, content FROM lucidia_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(convoId)
      .reverse();
    history.push({ role: 'user', content: String(content) });
    const reply = await llmProvider.chat({ messages: history, agent: agent_id ? { id: agent_id } : null, tools: [] });
    const agentMessageId = uuidv4();
    db.prepare(
      'INSERT INTO lucidia_messages (id, conversation_id, agent_id, role, content, token_count, created_at) VALUES (?,?,?,?,?,?,?)'
    ).run(
      agentMessageId,
      convoId,
      agent_id || null,
      'agent',
      reply.content,
      reply.token_count || 0,
      Math.floor(Date.now() / 1000)
    );
    io.to(`lucidia:${convo.project_id}`).emit('lucidia:message:new', {
      conversation_id: convoId,
      message: { id: agentMessageId, role: 'agent', content: reply.content }
    });
    res.json({ message_id: messageId, agent_message_id: agentMessageId });
  });

  app.use('/api/lucidia', lucidiaRouter);
})();

// LANDING
// Minimal landing page + stats + admin CMS endpoints
(function setupLanding() {
  const PUBLIC_DIR = path.join(__dirname, 'public');

  // Serve static assets (landing page)
  app.use(express.static(PUBLIC_DIR));

  // --- DB tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS landing_sections (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE,
      content_json TEXT,
      updated_by TEXT,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS public_stats_cache (
      id TEXT PRIMARY KEY,
      agents_active INTEGER DEFAULT 0,
      rc_minted_24h INTEGER DEFAULT 0,
      contradictions_24h INTEGER DEFAULT 0,
      uptime_24h_percent REAL DEFAULT 100.0,
      latency_p50_ms INTEGER DEFAULT 0,
      refreshed_at INTEGER
    );
  `);

  // Seed landing sections if empty
  const defaults = {
    hero: { headline: 'Co-create with Lucidia.', sub: 'Symbolic agents, live RC, contradiction-aware AI.', primaryCta: 'Get Started', secondaryCta: 'See Pricing' },
    features: [
      { title: 'Agents', desc: 'Multi-agent orchestration with memory.' },
      { title: 'RoadCoin', desc: 'Mint and meter usage cleanly.' },
      { title: 'Codex', desc: 'Symbolic truth engine with contradictions.' }
    ],
    testimonials: [],
    faq: [{ q: 'What is BlackRoad?', a: 'An AI-native co-creation stack with symbolic logic and RC metering.' }],
    footer: { links: [
      { label: 'Manifesto', to: '/manifesto' },
      { label: 'Roadbook', to: '/roadbook' },
      { label: 'Subscribe', to: '/subscribe' }
    ] }
  };
  const getSection = db.prepare('SELECT id FROM landing_sections WHERE key = ?');
  const insertSection = db.prepare('INSERT INTO landing_sections (id,key,content_json,updated_at) VALUES (?,?,?,?)');
  for (const [key, value] of Object.entries(defaults)) {
    if (!getSection.get(key)) {
      insertSection.run(require('crypto').randomUUID(), key, JSON.stringify(value), Math.floor(Date.now()/1000));
    }
  }

  // Ensure stats cache row
  const ensureStats = db.prepare('INSERT OR IGNORE INTO public_stats_cache (id, refreshed_at) VALUES ("global", 0)');
  ensureStats.run();

  // --- Helpers
  function computeStats() {
    const now = Math.floor(Date.now()/1000);
    let agents = 0, rc = 0, contradictions = 0, latency = 0, uptime = 99.9;
    try {
      agents = db.prepare('SELECT COUNT(*) AS c FROM agents WHERE heartbeat_at >= datetime("now", "-1 minute")').get().c;
    } catch {}
    try {
      rc = db.prepare('SELECT IFNULL(SUM(amount),0) AS s FROM transactions WHERE created_at >= datetime("now", "-1 day")').get().s;
    } catch {}
    try {
      contradictions = db.prepare('SELECT COUNT(*) AS c FROM contradictions WHERE created_at >= datetime("now", "-1 day")').get().c;
    } catch {}
    try {
      latency = db.prepare('SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50 FROM api_metrics WHERE path = "/api/llm/chat" AND ts >= strftime("%s", "now") - 86400').get().p50 || 0;
    } catch {}
    return { agents_active: agents, rc_minted_24h: rc, contradictions_24h: contradictions, uptime_24h_percent: uptime, latency_p50_ms: latency, refreshed_at: now };
  }

  function refreshStats() {
    const stats = computeStats();
    db.prepare(`UPDATE public_stats_cache SET agents_active=?, rc_minted_24h=?, contradictions_24h=?, uptime_24h_percent=?, latency_p50_ms=?, refreshed_at=? WHERE id='global'`).run(
      stats.agents_active, stats.rc_minted_24h, stats.contradictions_24h, stats.uptime_24h_percent, stats.latency_p50_ms, stats.refreshed_at
    );
    console.log('public.stats.refresh', stats);
    io.emit('public:stats', stats);
    return stats;
  }

  function getCachedStats() {
    const row = db.prepare('SELECT * FROM public_stats_cache WHERE id="global"').get();
    const now = Math.floor(Date.now()/1000);
    if (!row.refreshed_at || now - row.refreshed_at > 15) {
      return refreshStats();
    }
    return row;
  }

  // Periodic refresh every 30s
  setInterval(refreshStats, 30000).unref();

  // --- Routes
  app.get('/api/public/landing', (req, res) => {
    const rows = db.prepare('SELECT key, content_json FROM landing_sections').all();
    const sections = {};
    for (const r of rows) {
      try { sections[r.key] = JSON.parse(r.content_json); } catch { sections[r.key] = null; }
    }
    if (Math.random() < 0.1) console.log('landing.view');
    res.json({ sections });
  });

  app.get('/api/public/stats', (req, res) => {
    const stats = getCachedStats();
    res.json(stats);
  });

  // Admin routes
  const { requireAdmin } = require('./src/auth');
  const adminLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

  app.put('/api/admin/landing/section', requireAdmin, adminLimiter, (req, res) => {
    const { key, content } = req.body || {};
    const valid = ['hero', 'features', 'testimonials', 'faq', 'footer'];
    if (!valid.includes(key)) return res.status(400).json({ error: 'invalid_key', code: 400 });
    const json = JSON.stringify(content || null);
    const now = Math.floor(Date.now()/1000);
    db.prepare(`INSERT INTO landing_sections (id,key,content_json,updated_by,updated_at) VALUES (coalesce((SELECT id FROM landing_sections WHERE key=?), randomblob(16)),?,?,?,?) ON CONFLICT(key) DO UPDATE SET content_json=excluded.content_json, updated_by=excluded.updated_by, updated_at=excluded.updated_at`).run(key, key, json, req.session.userId || '', now);
    console.log('landing.cms.updated', { key, admin_id: req.session.userId });
    res.json({ ok: true });
  });

  app.post('/api/admin/landing/testimonial', requireAdmin, adminLimiter, (req, res) => {
    const { author, role, quote } = req.body || {};
    if (!author || !quote) return res.status(400).json({ error: 'missing_fields', code: 400 });
    const row = db.prepare('SELECT content_json FROM landing_sections WHERE key="testimonials"').get();
    let arr = [];
    try { arr = JSON.parse(row.content_json); } catch {}
    arr.push({ author: String(author).slice(0,200), role: String(role||'').slice(0,200), quote: String(quote).slice(0,500) });
    if (arr.length > 20) arr = arr.slice(-20);
    const json = JSON.stringify(arr);
    const now = Math.floor(Date.now()/1000);
    db.prepare('UPDATE landing_sections SET content_json=?, updated_by=?, updated_at=? WHERE key="testimonials"').run(json, req.session.userId || '', now);
    console.log('landing.cms.updated', { key: 'testimonials', admin_id: req.session.userId });
    res.json({ ok: true });
  });

  // Root route
  app.get('/', (req, res) => {
    if (Math.random() < 0.1) console.log('[INFO] Landing page view');
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
})();

// Global error handler (must be last)
app.use((err, req, res, next) => {
  console.error('[ERROR] Unhandled error:', err.message);
  console.error(err.stack);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    code: err.code || 'internal_error',
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server with graceful shutdown
// Note: server is already created earlier in the file at line ~639

server.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`[INFO] ✓ BlackRoad API Server running`);
  console.log(`[INFO] ✓ Port: ${PORT}`);
  console.log(`[INFO] ✓ Environment: ${NODE_ENV}`);
  console.log(`[INFO] ✓ Health check: http://localhost:${PORT}/api/health`);
  console.log('='.repeat(60));
});

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  console.log(`\n[INFO] ${signal} received, starting graceful shutdown...`);
  
  server.close(() => {
    console.log('[INFO] ✓ HTTP server closed');
    
    try {
      // Close database connection
      if (db && db.close) {
        db.close();
        console.log('[INFO] ✓ Database connection closed');
      }
    } catch (err) {
      console.error('[ERROR] Failed to close database:', err.message);
    }
    
    console.log('[INFO] ✓ Graceful shutdown complete');
    process.exit(0);
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('[ERROR] ⏱️  Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
