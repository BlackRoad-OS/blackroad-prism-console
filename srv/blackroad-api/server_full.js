'use strict';

/**
 * BlackRoad API — Express + SQLite + Socket.IO + LLM bridge
 * Runs behind Nginx on port 4000 with cookie-session auth.
 */

require('dotenv').config();

const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const cookieSession = require('cookie-session');
const morgan = require('morgan');
const { body, validationResult } = require('express-validator');
const { Server: SocketIOServer } = require('socket.io');
const { exec } = require('child_process');
const { randomUUID } = require('crypto');
const EventEmitter = require('events');
const Stripe = require('stripe');

const verify = require('./lib/verify');
const notify = require('./lib/notify');
const logger = require('./lib/log');
const git = require('./lib/git');
const deploy = require('./lib/deploy');
const { fetchWithProbe } = require('./lib/fetch_probe');
const { db, DB_PATH: libraryDbPath } = require('./lib/db');
const { TernaryError } = require('./lib/ternaryError');
const attachDebugProbes = require('./modules/debug_probes');
const maintenanceGuard = require('./modules/maintenanceGuard');
const attachLlmRoutes = require('./routes/admin_llm');
const gitRouter = require('./routes/git');
const providersRouter = require('./routes/providers');
const attachSlackExceptions = require('./modules/slack_exceptions');
const contradictionRoutes = require('./routes/contradictions');
const { contradictionLogger } = require('./middleware/contradictionLogger');
const { loadFlags } = require('../../packages/flags/store');
const { isOn } = require('../../packages/flags/eval');

const CRITICAL_ENV = {
  SESSION_SECRET: 'Session secret used to encrypt cookies',
  INTERNAL_TOKEN: 'Internal API token used for inter-service auth',
  ALLOW_ORIGINS: 'Comma separated list of allowed origins for CORS',
};

const OPTIONAL_DEFAULTS = {
  PORT: 4000,
  DB_PATH: libraryDbPath || '/srv/blackroad-api/blackroad.db',
  LLM_URL: 'http://127.0.0.1:8000/chat',
  MATH_ENGINE_URL: '',
  WEB_ROOT: '/var/www/blackroad',
  BILLING_DISABLE: false,
  BRANCH_MAIN: 'main',
  BRANCH_STAGING: 'staging',
  FLAGS_PARAM: '/blackroad/dev/flags',
  FLAGS_MAX_AGE_MS: 30000,
};

function parseBoolean(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  return /^(1|true|yes)$/i.test(String(raw).trim());
}

function parseNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number.parseInt(String(raw), 10);
  if (Number.isNaN(value)) {
    logger.warn({ event: 'invalid_env_number', name, value: raw, fallback });
    return fallback;
  }
  return value;
}

const missingCritical = Object.entries(CRITICAL_ENV)
  .filter(([name]) => !process.env[name] || !String(process.env[name]).trim())
  .map(([name, description]) => ({ name, description }));

if (missingCritical.length) {
  missingCritical.forEach(({ name, description }) => {
    logger.fatal({ event: 'missing_env', name, description });
  });
  process.exit(1);
}

const resolvedEnv = {
  PORT: parseNumber('PORT', OPTIONAL_DEFAULTS.PORT),
  SESSION_SECRET: String(process.env.SESSION_SECRET).trim(),
  INTERNAL_TOKEN: String(process.env.INTERNAL_TOKEN).trim(),
  ALLOW_ORIGINS: String(process.env.ALLOW_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  DB_PATH: process.env.DB_PATH || OPTIONAL_DEFAULTS.DB_PATH,
  LLM_URL: process.env.LLM_URL || OPTIONAL_DEFAULTS.LLM_URL,
  MATH_ENGINE_URL: process.env.MATH_ENGINE_URL || OPTIONAL_DEFAULTS.MATH_ENGINE_URL,
  ALLOW_SHELL: parseBoolean('ALLOW_SHELL', false),
  WEB_ROOT: process.env.WEB_ROOT || OPTIONAL_DEFAULTS.WEB_ROOT,
  BILLING_DISABLE: parseBoolean('BILLING_DISABLE', OPTIONAL_DEFAULTS.BILLING_DISABLE),
  BRANCH_MAIN: process.env.BRANCH_MAIN || OPTIONAL_DEFAULTS.BRANCH_MAIN,
  BRANCH_STAGING: process.env.BRANCH_STAGING || OPTIONAL_DEFAULTS.BRANCH_STAGING,
  FLAGS_PARAM: process.env.FLAGS_PARAM || OPTIONAL_DEFAULTS.FLAGS_PARAM,
  FLAGS_MAX_AGE_MS: parseNumber('FLAGS_MAX_AGE_MS', OPTIONAL_DEFAULTS.FLAGS_MAX_AGE_MS),
  DEBUG_MODE: parseBoolean('DEBUG_MODE', parseBoolean('DEBUG_PROBES', false)),
  BYPASS_LOGIN: parseBoolean('BYPASS_LOGIN', false),
  PRICE_BUILDER_MONTH_CENTS: parseNumber('PRICE_BUILDER_MONTH_CENTS', 0),
  PRICE_BUILDER_YEAR_CENTS: parseNumber('PRICE_BUILDER_YEAR_CENTS', 0),
  PRICE_PRO_MONTH_CENTS: parseNumber('PRICE_PRO_MONTH_CENTS', 0),
  PRICE_PRO_YEAR_CENTS: parseNumber('PRICE_PRO_YEAR_CENTS', 0),
  PRICE_ENTERPRISE_MONTH_CENTS: parseNumber('PRICE_ENTERPRISE_MONTH_CENTS', 0),
  PRICE_ENTERPRISE_YEAR_CENTS: parseNumber('PRICE_ENTERPRISE_YEAR_CENTS', 0),
  STRIPE_SECRET: process.env.STRIPE_SECRET || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  STRIPE_PUBLIC_KEY: process.env.STRIPE_PUBLIC_KEY || '',
  GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET || '',
  AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY || '',
  DISCORD_INVITE: process.env.DISCORD_INVITE || '',
  GOOGLE_CALENDAR_CREDENTIALS: process.env.GOOGLE_CALENDAR_CREDENTIALS || '',
  GSHEETS_SA_JSON: process.env.GSHEETS_SA_JSON || '',
  GUMROAD_TOKEN: process.env.GUMROAD_TOKEN || '',
  ICS_URL: process.env.ICS_URL || '',
  LINEAR_API_KEY: process.env.LINEAR_API_KEY || '',
  MAIL_PROVIDER: process.env.MAIL_PROVIDER || '',
  SF_USERNAME: process.env.SF_USERNAME || '',
  SHEETS_CONNECTOR_TOKEN: process.env.SHEETS_CONNECTOR_TOKEN || '',
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL || '',
  SUBSCRIBE_MODE: process.env.SUBSCRIBE_MODE || '',
};

const NODE_ENV = process.env.NODE_ENV || 'development';

if (!resolvedEnv.ALLOW_ORIGINS.length) {
  logger.fatal({ event: 'missing_env', name: 'ALLOW_ORIGINS', description: 'At least one origin must be allowed' });
  process.exit(1);
}

const optionalMissing = Object.entries({
  STRIPE_SECRET: resolvedEnv.STRIPE_SECRET,
  STRIPE_WEBHOOK_SECRET: resolvedEnv.STRIPE_WEBHOOK_SECRET,
  STRIPE_PUBLIC_KEY: resolvedEnv.STRIPE_PUBLIC_KEY,
  SLACK_WEBHOOK_URL: resolvedEnv.SLACK_WEBHOOK_URL,
  AIRTABLE_API_KEY: resolvedEnv.AIRTABLE_API_KEY,
  LINEAR_API_KEY: resolvedEnv.LINEAR_API_KEY,
  GOOGLE_CALENDAR_CREDENTIALS: resolvedEnv.GOOGLE_CALENDAR_CREDENTIALS,
  GSHEETS_SA_JSON: resolvedEnv.GSHEETS_SA_JSON,
  SHEETS_CONNECTOR_TOKEN: resolvedEnv.SHEETS_CONNECTOR_TOKEN,
  GUMROAD_TOKEN: resolvedEnv.GUMROAD_TOKEN,
  MAIL_PROVIDER: resolvedEnv.MAIL_PROVIDER,
}).filter(([, value]) => !value);

if (optionalMissing.length) {
  logger.warn({
    event: 'optional_env_missing',
    variables: optionalMissing.map(([name]) => name),
  });
}

const PORT = resolvedEnv.PORT;
const SESSION_SECRET = resolvedEnv.SESSION_SECRET;
const INTERNAL_TOKEN = resolvedEnv.INTERNAL_TOKEN;
const ALLOW_ORIGINS = resolvedEnv.ALLOW_ORIGINS;
const DB_PATH = resolvedEnv.DB_PATH;
const LLM_URL = resolvedEnv.LLM_URL;
const MATH_ENGINE_URL = resolvedEnv.MATH_ENGINE_URL;
const ALLOW_SHELL = resolvedEnv.ALLOW_SHELL;
const WEB_ROOT = resolvedEnv.WEB_ROOT;
const BILLING_DISABLE = resolvedEnv.BILLING_DISABLE;
const BRANCH_MAIN = resolvedEnv.BRANCH_MAIN;
const BRANCH_STAGING = resolvedEnv.BRANCH_STAGING;
const FLAGS_PARAM = resolvedEnv.FLAGS_PARAM;
const FLAGS_MAX_AGE_MS = resolvedEnv.FLAGS_MAX_AGE_MS;
const DEBUG_MODE = resolvedEnv.DEBUG_MODE;
const BYPASS_LOGIN = resolvedEnv.BYPASS_LOGIN;
const GITHUB_WEBHOOK_SECRET = resolvedEnv.GITHUB_WEBHOOK_SECRET;
const STRIPE_SECRET = resolvedEnv.STRIPE_SECRET;
const STRIPE_WEBHOOK_SECRET = resolvedEnv.STRIPE_WEBHOOK_SECRET;
const STRIPE_PUBLIC_KEY = resolvedEnv.STRIPE_PUBLIC_KEY;

const PRISM_PLACEHOLDER = {
  github: [
    { label: 'Mon', value: 32 },
    { label: 'Tue', value: 41 },
    { label: 'Wed', value: 27 },
    { label: 'Thu', value: 36 },
    { label: 'Fri', value: 44 },
    { label: 'Sat', value: 15 },
    { label: 'Sun', value: 18 },
  ],
  linear: [
    { label: 'Backlog', value: 128 },
    { label: 'In Progress', value: 64 },
    { label: 'Blocked', value: 9 },
    { label: 'Done', value: 302 },
  ],
  stripe: {
    mrr: 128_400,
    arr: 1_540_800,
    churnRate: 1.8,
  },
};

const {
  PRICE_BUILDER_MONTH_CENTS,
  PRICE_BUILDER_YEAR_CENTS,
  PRICE_PRO_MONTH_CENTS,
  PRICE_PRO_YEAR_CENTS,
  PRICE_ENTERPRISE_MONTH_CENTS,
  PRICE_ENTERPRISE_YEAR_CENTS,
  AIRTABLE_API_KEY,
  DISCORD_INVITE,
  GOOGLE_CALENDAR_CREDENTIALS,
  GSHEETS_SA_JSON,
  GUMROAD_TOKEN,
  ICS_URL,
  LINEAR_API_KEY,
  MAIL_PROVIDER,
  SF_USERNAME,
  SHEETS_CONNECTOR_TOKEN,
  SLACK_WEBHOOK_URL,
  SUBSCRIBE_MODE,
} = resolvedEnv;

const stripeClient = STRIPE_SECRET ? new Stripe(STRIPE_SECRET) : null;
const BILLING_ENABLED = Boolean(stripeClient && STRIPE_WEBHOOK_SECRET && !BILLING_DISABLE);
if (!stripeClient) {
  logger.info({ event: 'stripe_disabled', reason: 'missing_secret' });
} else {
  if (!STRIPE_WEBHOOK_SECRET) {
    logger.warn({ event: 'stripe_webhook_disabled', reason: 'missing STRIPE_WEBHOOK_SECRET' });
  }
  if (BILLING_DISABLE) {
    logger.warn({ event: 'billing_disabled_flag', enabled: false, via: 'BILLING_DISABLE' });
  } else if (BILLING_ENABLED) {
    logger.info({ event: 'billing_ready', provider: 'stripe' });
  }
}

const PLANS = [
  {
    id: 'builder',
    name: 'Builder',
    slug: 'builder',
    monthly: PRICE_BUILDER_MONTH_CENTS,
    annual: PRICE_BUILDER_YEAR_CENTS,
    features: [
      'Portal access',
      'Agent Stack (basic)',
      '100 chat turns/day',
      'RC mint monthly',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    slug: 'pro',
    monthly: PRICE_PRO_MONTH_CENTS,
    annual: PRICE_PRO_YEAR_CENTS,
    features: [
      'Portal access',
      'Agent Stack (basic)',
      '100 chat turns/day',
      'RC mint monthly',
      'Priority queue',
      'Advanced agents',
      '5,000 chat turns/day',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    slug: 'enterprise',
    monthly: PRICE_ENTERPRISE_MONTH_CENTS,
    annual: PRICE_ENTERPRISE_YEAR_CENTS,
    features: [
      'Portal access',
      'Agent Stack (basic)',
      '100 chat turns/day',
      'RC mint monthly',
      'Priority queue',
      'Advanced agents',
      '5,000 chat turns/day',
      'Org SSO (stub)',
      'Dedicated support',
      'Custom connectors',
    ],
  },
];

const PLAN_ENTITLEMENTS = {
  free: {
    planName: 'Free',
    entitlements: {
      can: { math: { pro: false } },
      limits: { api: { qps: 5 } },
    },
  },
  builder: {
    planName: 'Builder',
    entitlements: {
      can: { math: { pro: true } },
      limits: { api: { qps: 10 } },
    },
  },
  pro: {
    planName: 'Pro',
    entitlements: {
      can: { math: { pro: true } },
      limits: { api: { qps: 10 } },
    },
  },
  guardian: {
    planName: 'Guardian',
    entitlements: {
      can: { math: { pro: true } },
      limits: { api: { qps: 20 } },
    },
  },
  enterprise: {
    planName: 'Enterprise',
    entitlements: {
      can: { math: { pro: true } },
      limits: { api: { qps: 20 } },
    },
  },
};

// --- App & server
const app = express();
// Trust first proxy (e.g., Nginx) so secure headers like HSTS work behind TLS terminators
app.set('trust proxy', 1);
require('./modules/jsonEnvelope')(app);
require('./modules/jsonify_proxy')({ app });
// requestGuard preserves req.rawBody for webhook verification. If you swap it out,
// ensure express.raw({ type: 'application/json' }) (or equivalent) runs before
// the billing webhook route so Stripe receives the exact payload.
require('./modules/requestGuard')(app);
require('./modules/truth_identity')({ app });
require('./modules/truth_api')({ app });
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  path: '/socket.io',
  serveClient: false,
  cors: { origin: false }, // same-origin via Nginx
});

require('./modules/deploy_hook')({ app });

// Partner relay for mTLS-authenticated teammates
require('./modules/partner_relay_mtls')({ app });
require('./modules/projects')({ app });
require('./modules/pr_proxy')({ app });
require('./modules/patentnet')({ app });
require('./modules/love_math')({ app });
require('./modules/jobs')({ app });
require('./modules/memory')({ app });
require('./modules/brain_chat')({ app });
// --- Middleware
app.disable('x-powered-by');
app.use(helmet());
// Enforce strict transport security and limit referrer leakage
app.use(
  helmet.hsts({
    maxAge: 60 * 60 * 24 * 365 * 2, // 2 years
    includeSubDomains: true,
    preload: true,
  })
);
app.use(helmet.referrerPolicy({ policy: 'no-referrer' }));
require('./modules/trust_math')({ app });
// Devices backplane
require('./modules/devices')({ app, io, dbPath: DB_PATH });
// Mount project-specific job runner under a separate prefix so the
// legacy deployment job endpoints at `/api/jobs` continue to work.
require('./modules/jobs')({ app, prefix: '/api/project-jobs' });
require('./modules/truth_quorum')({ app, io });
require('./modules/trust_graph')({ app });

const emitter = new EventEmitter();
const jobs = new Map();
let jobSeq = 0;

function addJob(type, payload, runner) {
  const id = String(++jobSeq);
  const job = {
    id,
    type,
    payload,
    status: 'queued',
    created: Date.now(),
    logs: [],
  };
  jobs.set(id, job);
  process.nextTick(async () => {
    job.status = 'running';
    try {
      await runner(id, payload);
      job.status = 'success';
    } catch (e) {
      job.status = 'failed';
      job.error = String(e);
    } finally {
      emitter.emit(id, null);
    }
  });
  return job;
}

function logLine(id, line) {
  const job = jobs.get(id);
  if (job) job.logs.push(line);
  emitter.emit(id, line);
}

// --- Middleware
app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOW_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed'), false);
    },
    credentials: true,
  })
);
app.use(rateLimit({ windowMs: 60_000, max: 100 }));
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      id: res.getHeader('X-Request-ID'),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration: Date.now() - start,
    });
  }),
);
app.use(rateLimit({ windowMs: 60_000, max: 100 }));
app.use((req, res, next) => {
  const id = randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration: Date.now() - start,
    });
  });
  next();
});
app.use(async (req, res, next) => {
  try {
    const doc = await loadFlags(FLAGS_PARAM, FLAGS_MAX_AGE_MS);
    const sessionUser = (req.session && req.session.user) || {};
    const userId = sessionUser.id || sessionUser.username || undefined;
    const email = sessionUser.email || undefined;
    const headerReqId = req.headers['x-request-id'];
    const resReqId = res.getHeader('X-Request-ID');
    const reqId =
      (typeof headerReqId === 'string' && headerReqId) ||
      (typeof resReqId === 'string' && resReqId) ||
      (req.id && String(req.id)) ||
      randomUUID();

    req.flags = {
      docVersion: doc.version || 0,
      on: (key) => {
        try {
          return isOn(doc, key, { userId, email, reqId });
        } catch (error) {
          logger.warn('flag_eval_failed', {
            key,
            message: error && error.message ? error.message : 'unknown_error',
          });
          return false;
        }
      },
      doc,
    };
  } catch (error) {
    logger.error('flag_load_failed', error);
    req.flags = {
      docVersion: 0,
      on: () => false,
      doc: { features: {} },
    };
  }
  next();
});
app.use(compression());
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(morgan('tiny'));
attachDebugProbes({ app, logger, enabled: DEBUG_MODE });
app.use(compression());
app.use(
  cookieSession({
    name: 'brsess',
    keys: [SESSION_SECRET],
    httpOnly: true,
    sameSite: 'lax',
    secure: NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8, // 8h
  })
);

app.use(maintenanceGuard({ logger }));

  }),
);

// --- Homepage
app.get('/', (_, res) => {
  res.sendFile(path.join(WEB_ROOT, 'index.html'));
});
app.head('/health/live', (_req, res) => {
  res.setHeader('Cache-Control', 'max-age=10');
  res.status(200).end();
});
app.get('/health/live', (_req, res) => {
  res.setHeader('Cache-Control', 'max-age=10');
  res.json({ status: 'ok', ts: new Date().toISOString() });
});
app.head('/health/ready', (_req, res) => {
  res.status(200).end();
});
app.get('/health/ready', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});
app.head('/health', (_req, res) => res.status(200).end());
app.get('/health', (_req, res) => {
  res.json({ ok: true, version: '1.0.0', uptime: process.uptime() });
});


// --- Health
app.head('/api/health', (_, res) => res.status(200).end());
app.get('/api/health', async (_req, res) => {
  let llm = false;
  try {
    const r = await fetch('http://127.0.0.1:8000/health');
    llm = r.ok;
  } catch {}
  res.json({
    ok: true,
    version: '1.0.0',
    uptime: process.uptime(),
    services: { api: true, llm },
    services: { api: true, llm }
  });
});

// --- PRISM metrics
function ensureFlag(req, res, flagKey) {
  if (!req.flags || typeof req.flags.on !== 'function') {
    return res
      .status(503)
      .json({ error: 'flags_unavailable', flag: flagKey, version: 0 });
  }
  if (!req.flags.on(flagKey)) {
    return res.status(404).json({
      error: 'feature_disabled',
      flag: flagKey,
      version: req.flags.docVersion,
    });
  }
  return null;
}

app.get('/api/prism/github/issues_opened', requireAuth, (req, res) => {
  const blocked = ensureFlag(req, res, 'prism.github.tiles');
  if (blocked) return;
  res.json({ series: PRISM_PLACEHOLDER.github, version: req.flags.docVersion });
});

app.get('/api/prism/linear/board', requireAuth, (req, res) => {
  const blocked = ensureFlag(req, res, 'prism.linear.tiles');
  if (blocked) return;
  res.json({
    columns: PRISM_PLACEHOLDER.linear,
    version: req.flags.docVersion,
  });
});

app.get('/api/prism/stripe/summary', requireAuth, (req, res) => {
  const blocked = ensureFlag(req, res, 'prism.stripe.tiles');
  if (blocked) return;
  res.json({
    summary: PRISM_PLACEHOLDER.stripe,
    version: req.flags.docVersion,
  });
});

// --- Auth (cookie-session)
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'unauthorized' });
}
app.get('/api/session', (req, res) => {
  res.json({ user: req.session?.user || null });
});
app.post(
  '/api/login',
  [body('username').isString(), body('password').isString()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'invalid_request' });
    }
    const { username, password } = req.body || {};
    // dev defaults: root / Codex2025 (can be replaced with real auth)
    if ((username === 'root' && password === 'Codex2025') || BYPASS_LOGIN) {
      req.session.user = { username, role: 'dev', plan: 'free' };
      return res.json({ ok: true, user: req.session.user });
    }
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  },
);
app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// --- Git operations
app.use('/api/git', requireAuth, require('./routes/git'));

// --- Billing (stubs)
app.get('/api/billing/plans', (req, res) => {
  res.json(
    PLANS.map(({ id, name, slug, monthly, annual, features }) => ({
      id,
      name,
      slug,
      monthly,
      annual,
      features,
    })),
  );
});

app.get('/api/billing/entitlements/me', requireAuth, (req, res) => {
  const plan = req.session.user.plan || 'free';
  const conf = PLAN_ENTITLEMENTS[plan] || PLAN_ENTITLEMENTS.free;
  res.json({ planName: conf.planName, entitlements: conf.entitlements });
});

app.post('/api/billing/checkout', requireAuth, (req, res) => {
  if (BILLING_DISABLE) return res.status(503).json({ disabled: true });
  res.json({ checkoutUrl: '/subscribe?demo=1' });
});

app.post('/api/billing/portal', requireAuth, (req, res) => {
  if (BILLING_DISABLE) return res.status(503).json({ disabled: true });
  res.json({ portalUrl: '/subscribe?portal=1' });
});

app.post('/api/billing/webhook', (req, res) => {
  if (!stripeClient || !STRIPE_WEBHOOK_SECRET) {
    return res.status(501).json({ error: 'stripe_unconfigured' });
  }
  const sig = req.headers['stripe-signature'];
  const rawBody =
    typeof req.rawBody === 'string'
      ? req.rawBody
      : JSON.stringify(req.body ?? {});
  let event;
  try {
    event = stripeClient.webhooks.constructEvent(
      rawBody,
  let event;
  try {
    event = stripeClient.webhooks.constructEvent(
      JSON.stringify(req.body),
      sig,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (e) {
    logger.error({ event: 'stripe_webhook_verify_failed', err: e });
    logger.error('stripe_webhook_verify_failed', e);
    return res.status(400).json({ error: 'invalid_signature' });
  }
  emitter.emit('stripe:event', event);
  res.json({ received: true });
});

// --- SQLite bootstrap
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

attachSlackExceptions({ app, db });

const TABLES = ['projects', 'agents', 'datasets', 'models', 'integrations'];
for (const t of TABLES) {
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS ${t} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      meta JSON
    )
  `
  `,
  ).run();
}

// Subscription tables
db.prepare(
  `
db.prepare(`
  CREATE TABLE IF NOT EXISTS subscribers (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT,
    company TEXT,
    created_at TEXT,
    source TEXT
  )
`
).run();
db.prepare(
  `
`).run();
db.prepare(`
`,
).run();
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    subscriber_id TEXT,
    plan TEXT,
    cycle TEXT,
    status TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TEXT,
    updated_at TEXT
  )
`
).run();
db.prepare(
  `
`).run();
db.prepare(`
`,
).run();
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    subscription_id TEXT,
    provider TEXT,
    amount_cents INTEGER,
    currency TEXT,
    status TEXT,
    raw JSON,
    created_at TEXT
  )
`
).run();
db.prepare(
  `
`).run();
db.prepare(`
`,
).run();
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS logs_connectors (
    id TEXT PRIMARY KEY,
    subscriber_id TEXT,
    action TEXT,
    connector TEXT,
    ok INTEGER,
    detail TEXT,
    created_at TEXT
  )
`
).run();

// Billing tables (minimal subset)
db.prepare(
  `
`).run();
`,
).run();

// Billing tables (minimal subset)
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    monthly_price_cents INTEGER NOT NULL DEFAULT 0,
    yearly_price_cents INTEGER NOT NULL DEFAULT 0,
    features TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
  )
`
).run();
`).run();
`,
).run();

// Seed default plans if table empty
const planCount = db.prepare('SELECT COUNT(*) as c FROM plans').get().c;
if (planCount === 0) {
  const defaultPlans = [
    {
      id: 'free',
      name: 'Free',
      monthly: 0,
      yearly: 0,
      features: ['Basic access'],
    },
    {
      id: 'builder',
      name: 'Builder',
      monthly: 1500,
      yearly: 15000,
      features: ['Builder tools', 'Email support'],
    },
    {
      id: 'pro',
      name: 'Pro',
      monthly: 4000,
      yearly: 40000,
      features: ['All builder features', 'Priority support'],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      monthly: 0,
      yearly: 0,
      features: ['Custom pricing', 'Dedicated support'],
    },
  ];
  const stmt = db.prepare(
    'INSERT INTO plans (id, name, monthly_price_cents, yearly_price_cents, features, is_active) VALUES (?, ?, ?, ?, ?, 1)'
  );
    { id: 'free', name: 'Free', monthly: 0, yearly: 0, features: ['Basic access'] },
    { id: 'builder', name: 'Builder', monthly: 1500, yearly: 15000, features: ['Builder tools', 'Email support'] },
    { id: 'pro', name: 'Pro', monthly: 4000, yearly: 40000, features: ['All builder features', 'Priority support'] },
    { id: 'enterprise', name: 'Enterprise', monthly: 0, yearly: 0, features: ['Custom pricing', 'Dedicated support'] },
  ];
  const stmt = db.prepare(
    'INSERT INTO plans (id, name, monthly_price_cents, yearly_price_cents, features, is_active) VALUES (?, ?, ?, ?, ?, 1)',
  );
  for (const p of defaultPlans) {
    stmt.run(p.id, p.name, p.monthly, p.yearly, JSON.stringify(p.features));
  }
}

// Quantum AI table seed
db.prepare(
  `
db.prepare(`
  CREATE TABLE IF NOT EXISTS quantum_ai (
    topic TEXT PRIMARY KEY,
    summary TEXT NOT NULL
  )
`
).run();
const qSeed = [
`).run();
const quantumSeed = [
  {
    topic: 'reasoning',
    summary:
      'Quantum parallelism lets models explore many reasoning paths simultaneously for accelerated insight.',
  },
  {
    topic: 'memory',
    summary:
      'Quantum RAM with entangled states hints at dense, instantly linked memory architectures.',
  },
  {
    topic: 'symbolic',
    summary:
      'Interference in quantum-symbolic AI could amplify useful symbol chains while damping noise.',
  },
];
for (const row of qSeed) {
  db.prepare(
    'INSERT OR IGNORE INTO quantum_ai (topic, summary) VALUES (?, ?)'
  ).run(row.topic, row.summary);
}

// Git API
app.use('/api/git', requireAuth, gitRouter);
app.use('/v1/providers', providersRouter);
app.use(contradictionRoutes);

const upsertQuantum = db.prepare(
  'INSERT OR IGNORE INTO quantum_ai (topic, summary) VALUES (?, ?)',
);
for (const row of quantumSeed) {
  upsertQuantum.run(row.topic, row.summary);
}

// Helpers
function listRows(t) {
  return db
    .prepare(
      `SELECT id, name, updated_at, meta FROM ${t} ORDER BY datetime(updated_at) DESC`
      `SELECT id, name, updated_at, meta FROM ${t} ORDER BY datetime(updated_at) DESC`,
    )
    .all();
}
function createRow(t, name, meta = null) {
  const stmt = db.prepare(
    `INSERT INTO ${t} (name, updated_at, meta) VALUES (?, datetime('now'), ?)`
    `INSERT INTO ${t} (name, updated_at, meta) VALUES (?, datetime('now'), ?)`,
  );
  const info = stmt.run(name, meta ? JSON.stringify(meta) : null);
  return info.lastInsertRowid;
}
function updateRow(t, id, name, meta = null) {
  const stmt = db.prepare(
    `UPDATE ${t} SET name = COALESCE(?, name), meta = COALESCE(?, meta), updated_at = datetime('now') WHERE id = ?`
    `UPDATE ${t} SET name = COALESCE(?, name), meta = COALESCE(?, meta), updated_at = datetime('now') WHERE id = ?`,
  );
  stmt.run(name ?? null, meta ? JSON.stringify(meta) : null, id);
}
function deleteRow(t, id) {
  db.prepare(`DELETE FROM ${t} WHERE id = ?`).run(id);
}
function validKind(kind) {
  return TABLES.includes(kind);
}

// --- CRUD routes (guard with auth once you’re ready)
app.get('/api/:kind', requireAuth, (req, res) => {
  const { kind } = req.params;
  if (!validKind(kind)) return res.status(404).json({ error: 'unknown_kind' });
  try {
    res.json(listRows(kind));
  } catch (e) {
    res.status(500).json({ error: 'db_list_failed', detail: String(e) });
  }
});
app.post('/api/:kind', requireAuth, (req, res) => {
  const { kind } = req.params;
  const { name, meta } = req.body || {};
  if (!validKind(kind)) return res.status(404).json({ error: 'unknown_kind' });
  if (!name) return res.status(400).json({ error: 'name_required' });
  try {
    const id = createRow(kind, name, meta);
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: 'db_create_failed', detail: String(e) });
  }
});
app.post('/api/:kind/:id', requireAuth, (req, res) => {
  const { kind, id } = req.params;
  const { name, meta } = req.body || {};
  if (!validKind(kind)) return res.status(404).json({ error: 'unknown_kind' });
  try {
    updateRow(kind, Number(id), name, meta);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'db_update_failed', detail: String(e) });
  }
});
app.delete('/api/:kind/:id', requireAuth, (req, res) => {
  const { kind, id } = req.params;
  if (!validKind(kind)) return res.status(404).json({ error: 'unknown_kind' });
  try {
    deleteRow(kind, Number(id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'db_delete_failed', detail: String(e) });
  }
});

// --- Subscribe & connectors
const VALID_PLANS = ['free', 'builder', 'guardian'];
const VALID_CYCLES = ['monthly', 'annual'];

app.get('/api/connectors/status', async (_req, res) => {
  const config = {
    stripe: !!(
      STRIPE_PUBLIC_KEY &&
      STRIPE_SECRET &&
      STRIPE_WEBHOOK_SECRET
    ),
    mail: !!MAIL_PROVIDER,
    sheets: !!(
      GSHEETS_SA_JSON || SHEETS_CONNECTOR_TOKEN
    ),
    calendar: !!(
      GOOGLE_CALENDAR_CREDENTIALS || ICS_URL
    ),
    discord: !!DISCORD_INVITE,
    webhooks: false,
  };

  const live = {
    slack: false,
    airtable: false,
    linear: false,
    salesforce: false,
  };

  try {
    if (SLACK_WEBHOOK_URL) {
      await notify.slack('status check');
      live.slack = true;
    }
  } catch {}

  try {
    if (AIRTABLE_API_KEY) live.airtable = true;
  } catch {}

  try {
    if (LINEAR_API_KEY) live.linear = true;
  } catch {}

  try {
    if (SF_USERNAME) live.salesforce = true;
  } catch {}

  config.webhooks = config.stripe;

  res.json({ config, live });
});

// Basic health endpoint exposing provider mode
app.get('/api/subscribe/health', (_req, res) => {
  const mode =
    SUBSCRIBE_MODE ||
    (STRIPE_SECRET
      ? 'stripe'
      : GUMROAD_TOKEN
        ? 'gumroad'
        : 'local');
  let providerReady = false;
  if (mode === 'stripe') providerReady = !!STRIPE_SECRET;
  else if (mode === 'gumroad') providerReady = !!GUMROAD_TOKEN;
  else providerReady = true;
  res.json({ ok: true, mode, providerReady });
});

app.post('/api/subscribe/checkout', (req, res) => {
  const { plan, cycle } = req.body || {};
  if (!VALID_PLANS.includes(plan) || !VALID_CYCLES.includes(cycle)) {
    return res.status(400).json({ error: 'invalid_input' });
  }
  if (!STRIPE_SECRET) {
    return res.status(409).json({ mode: 'invoice' });
  }
  // Stripe integration would go here
  res.json({ url: 'https://stripe.example/checkout' });
});

app.post('/api/subscribe/invoice-intent', (req, res) => {
  const { plan, cycle, email, name, company, address, notes } = req.body || {};
  if (!email || !VALID_PLANS.includes(plan) || !VALID_CYCLES.includes(cycle)) {
    return res.status(400).json({ error: 'invalid_input' });
  }
  let sub = db.prepare('SELECT id FROM subscribers WHERE email = ?').get(email);
  let subscriberId = sub ? sub.id : randomUUID();
  if (!sub) {
    db.prepare(
      'INSERT INTO subscribers (id, email, name, company, created_at, source) VALUES (?, ?, ?, ?, datetime("now"), ?)'
    ).run(subscriberId, email, name || null, company || null, 'invoice');
  }
  const subscriptionId = randomUUID();
  db.prepare(
    'INSERT INTO subscriptions (id, subscriber_id, plan, cycle, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime("now"), datetime("now"))'
  ).run(subscriptionId, subscriberId, plan, cycle, 'pending_invoice');
  res.json({ ok: true, next: '/subscribe/thanks' });
});

app.post('/api/wallet/credit', (req, res, next) => {
  try {
    const amountRaw = req.body?.amount;
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount)) {
      throw new TernaryError('Amount must be a finite number', {
        state: -1,
        code: 'AMOUNT_INVALID',
        severity: 'high',
        hint: 'Provide a numeric amount to credit',
      });
    }
    if (amount === 0) {
      throw new TernaryError('Zero amount is neutral no-op', {
        state: 0,
        code: 'AMOUNT_ZERO',
        hint: 'Skip write when amount is 0',
      });
    }
    if (amount < 0) {
      throw new TernaryError('Negative credit is contradiction', {
        state: -1,
        code: 'NEGATIVE_CREDIT',
        severity: 'high',
        hint: 'Use /api/wallet/debit for negative amounts',
      });
    }

    res.json({ ok: true, state: 1, credited: amount });
  } catch (err) {
    next(err);
  }
});

app.get('/api/subscribe/status', (req, res) => {
  const { email } = req.query || {};
  if (!email) return res.status(400).json({ error: 'email_required' });
  const row = db
    .prepare(
      'SELECT s.plan, s.cycle, s.status FROM subscribers sub JOIN subscriptions s ON sub.id = s.subscriber_id WHERE sub.email = ? ORDER BY datetime(s.created_at) DESC LIMIT 1'
    )
    .get(email);
  res.json(row || { status: 'none' });
});

// --- Billing: plans
app.get('/api/subscribe/plans', requireAuth, (_req, res) => {
  try {
    const rows = db
      .prepare(
        'SELECT id, name, monthly_price_cents, yearly_price_cents, features, is_active FROM plans WHERE is_active = 1'
      )
      .all();
    for (const r of rows) {
      try {
        r.features = JSON.parse(r.features);
      } catch {
        r.features = [];
      }
    }
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'db_plans_failed', detail: String(e) });
  }
});

// --- Subscribe & connectors
const VALID_PLANS = ['free', 'builder', 'guardian'];
const VALID_CYCLES = ['monthly', 'annual'];

app.get('/api/connectors/status', (req, res) => {
  const stripe = !!(
    STRIPE_PUBLIC_KEY &&
    STRIPE_SECRET &&
    STRIPE_WEBHOOK_SECRET
  );
  const mail = !!MAIL_PROVIDER;
  const sheets = !!(
    GSHEETS_SA_JSON || SHEETS_CONNECTOR_TOKEN
  );
  const calendar = !!(
    GOOGLE_CALENDAR_CREDENTIALS || ICS_URL
  );
  const discord = !!DISCORD_INVITE;
  const webhooks = stripe; // placeholder
  res.json({ stripe, mail, sheets, calendar, discord, webhooks });
});

// Basic health endpoint exposing provider mode
app.get('/api/subscribe/health', (_req, res) => {
  const mode =
    SUBSCRIBE_MODE ||
    (STRIPE_SECRET
      ? 'stripe'
      : GUMROAD_TOKEN
        ? 'gumroad'
        : 'local');
  let providerReady = false;
  if (mode === 'stripe') providerReady = !!STRIPE_SECRET;
  else if (mode === 'gumroad') providerReady = !!GUMROAD_TOKEN;
  else providerReady = true;
  res.json({ ok: true, mode, providerReady });
});

app.post('/api/subscribe/checkout', (req, res) => {
  const { plan, cycle } = req.body || {};
  if (!VALID_PLANS.includes(plan) || !VALID_CYCLES.includes(cycle)) {
    return res.status(400).json({ error: 'invalid_input' });
  }
  if (!STRIPE_SECRET) {
    return res.status(409).json({ mode: 'invoice' });
  }
  // Stripe integration would go here
  res.json({ url: 'https://stripe.example/checkout' });
});

app.post('/api/subscribe/invoice-intent', (req, res) => {
  const { plan, cycle, email, name, company, address, notes } = req.body || {};
  if (!email || !VALID_PLANS.includes(plan) || !VALID_CYCLES.includes(cycle)) {
    return res.status(400).json({ error: 'invalid_input' });
  }
  let sub = db.prepare('SELECT id FROM subscribers WHERE email = ?').get(email);
  let subscriberId = sub ? sub.id : randomUUID();
  if (!sub) {
    db.prepare(
      'INSERT INTO subscribers (id, email, name, company, created_at, source) VALUES (?, ?, ?, ?, datetime("now"), ?)',
    ).run(subscriberId, email, name || null, company || null, 'invoice');
  }
  const subscriptionId = randomUUID();
  db.prepare(
    'INSERT INTO subscriptions (id, subscriber_id, plan, cycle, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime("now"), datetime("now"))',
  ).run(subscriptionId, subscriberId, plan, cycle, 'pending_invoice');
  res.json({ ok: true, next: '/subscribe/thanks' });
});

app.get('/api/subscribe/status', (req, res) => {
  const { email } = req.query || {};
  if (!email) return res.status(400).json({ error: 'email_required' });
  const row = db
    .prepare(
      'SELECT s.plan, s.cycle, s.status FROM subscribers sub JOIN subscriptions s ON sub.id = s.subscriber_id WHERE sub.email = ? ORDER BY datetime(s.created_at) DESC LIMIT 1',
    )
    .get(email);
  res.json(row || { status: 'none' });
});

// --- Billing: plans
app.get('/api/subscribe/plans', requireAuth, (_req, res) => {
  try {
    const rows = db
      .prepare(
        'SELECT id, name, monthly_price_cents, yearly_price_cents, features, is_active FROM plans WHERE is_active = 1',
      )
      .all();
    for (const r of rows) {
      try {
        r.features = JSON.parse(r.features);
      } catch {
        r.features = [];
      }
    }
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'db_plans_failed', detail: String(e) });
  }
});

// --- LLM bridge (/api/llm/chat)
// Forwards body to FastAPI (LLM_URL) and streams raw text back to the client.
app.post('/api/llm/chat', requireAuth, async (req, res) => {
  try {
    const upstream = await fetchWithProbe(
      LLM_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {}),
      },
      { label: 'llm_chat', enabled: DEBUG_MODE, logger }
    );
    const upstream = await fetch(LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });

    // Stream if possible
    if (upstream.ok && upstream.body) {
      res.status(200);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // passthrough raw bytes (FastAPI may send plain text or SSE-like chunks)
        res.write(Buffer.from(value));
      }
      return res.end();
    }

    // Non-stream fallback
    const txt = await upstream.text().catch(() => '');
    // try to unwrap {text: "..."}
    let out = txt;
    try {
      const j = JSON.parse(txt);
      if (j && typeof j.text === 'string') out = j.text;
    } catch {}
    res
      .status(upstream.ok ? 200 : upstream.status)
      .type('text/plain')
      .send(out || '(no content)');
  } catch (e) {
    res.status(502).type('text/plain').send('(llm upstream error)');
  }
});

attachLlmRoutes(app);

// --- Optional shell exec (disabled by default)
app.post('/api/exec', requireAuth, (req, res) => {
  if (!ALLOW_SHELL) return res.status(403).json({ error: 'exec_disabled' });
  const cmd = ((req.body && req.body.cmd) || '').trim();
  if (!cmd) return res.status(400).json({ error: 'cmd_required' });
  exec(cmd, { timeout: 20000 }, (err, stdout, stderr) => {
    if (err)
      return res
        .status(500)
        .json({ error: 'exec_failed', detail: String(err), stderr });
    res.json({ out: stdout, stderr });
  });
});

// --- Quantum AI summaries
app.get('/api/quantum/:topic', (req, res) => {
  const { topic } = req.params;
  const row = db
    .prepare('SELECT summary FROM quantum_ai WHERE topic = ?')
    .get(topic);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ topic, summary: row.summary });
// --- Deployment and CI endpoints
app.post('/api/webhooks/github', async (req, res) => {
  const sig = req.get('X-Hub-Signature-256');
  const raw = JSON.stringify(req.body || {});
  if (!verify.verifySignature(GITHUB_WEBHOOK_SECRET, raw, sig)) {
    return res.status(401).end('invalid_signature');
  }
  const event = req.get('X-GitHub-Event');
  if (event === 'ping') return res.json({ ok: true });
  if (event === 'push') {
    const branch = req.body.ref?.replace('refs/heads/', '');
    if (!verify.branchAllowed(branch, [BRANCH_MAIN, BRANCH_STAGING]))
      return res.status(202).end();
    const sha = req.body.after;
    const job = addJob('deploy', { branch, sha }, async (id, payload) => {
      logLine(id, 'git fetch');
      await git.fetch();
      await git.checkout(payload.branch);
      await git.resetHard(payload.sha);
      await git.clean();
      logLine(id, 'deploy');
      await deploy.stageAndSwitch(payload);
      await notify.slack(`Deploy ${payload.branch} ${payload.sha} succeeded`);
    });
    return res.json({ ok: true, jobId: job.id });
  }
  if (event === 'pull_request') {
    const job = addJob('ci', {}, async (id) =>
      logLine(id, 'ci not implemented'),
    );
    return res.json({ ok: true, jobId: job.id });
  }
  res.json({ ok: true });
});

app.post('/api/deploy/plan', (req, res) => {
  if (!verify.verifyToken(req.get('X-Internal-Token'), INTERNAL_TOKEN))
    return res.status(401).end();
  res.json({ ok: true, steps: ['build', 'switch'] });
});

app.post('/api/deploy/execute', (req, res) => {
  if (!verify.verifyToken(req.get('X-Internal-Token'), INTERNAL_TOKEN))
    return res.status(401).end();
  const { branch = BRANCH_MAIN, sha } = req.body || {};
  const job = addJob('deploy_manual', { branch, sha }, async (id, payload) => {
    await git.fetch();
    await git.checkout(payload.branch);
    if (payload.sha) await git.resetHard(payload.sha);
    await git.clean();
    await deploy.stageAndSwitch(payload);
  });
  res.json({ ok: true, jobId: job.id });
});

app.post('/api/git/sync', (req, res) => {
  if (!verify.verifyToken(req.get('X-Internal-Token'), INTERNAL_TOKEN))
    return res.status(401).end();
  const { branch = BRANCH_MAIN } = req.body || {};
  addJob('git_sync', { branch }, async (id, payload) => {
    await git.fetch();
    await git.checkout(payload.branch);
    await git.resetHard(`origin/${payload.branch}`);
    await git.clean();
  });
  res.json({ ok: true });
});

app.get('/api/jobs', (req, res) => {
  res.json(Array.from(jobs.values()).reverse());
});

app.get('/api/jobs/:id/log', (req, res) => {
  const { id } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  const send = (line) => {
    if (line === null) return res.write('event: end\n\n');
    res.write(`data: ${line}\n\n`);
  };
  const listener = (l) => send(l);
  emitter.on(id, listener);
  const job = jobs.get(id);
  if (job) job.logs.forEach(send);
  req.on('close', () => emitter.removeListener(id, listener));
});

app.post('/api/rollback/:releaseId', (req, res) => {
  if (!verify.verifyToken(req.get('X-Internal-Token'), INTERNAL_TOKEN))
    return res.status(401).end();
  const releaseId = req.params.releaseId;
  const job = addJob('rollback', { releaseId }, async (id, payload) => {
    await deploy.stageAndSwitch({ branch: 'rollback', sha: payload.releaseId });
  });
  res.json({ ok: true, jobId: job.id });
});

app.get('/api/connectors/status', async (_req, res) => {
  const status = {
    slack: false,
    airtable: false,
    linear: false,
    salesforce: false,
  };
  try {
    if (SLACK_WEBHOOK_URL) {
      await notify.slack('status check');
      status.slack = true;
    }
  } catch {}
  try {
    if (AIRTABLE_API_KEY) status.airtable = true;
  } catch {}
  try {
    if (LINEAR_API_KEY) status.linear = true;
  } catch {}
  try {
    if (SF_USERNAME) status.salesforce = true;
  } catch {}
  res.json(status);
});

// --- Quantum AI summaries
app.get('/api/quantum', (_req, res) => {
  const topics = db
    .prepare('SELECT topic, summary FROM quantum_ai ORDER BY topic ASC')
    .all();
  res.json({ topics });
});
app.get('/api/quantum/:topic', (req, res) => {
  const { topic } = req.params;
  const row = db.prepare('SELECT summary FROM quantum_ai WHERE topic = ?').get(topic);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ topic, summary: row.summary });
// --- Math (forwarder)
app.get('/api/math/health', async (_req, res) => {
  if (MATH_ENGINE_URL) {
    try {
      const r = await fetch(`${MATH_ENGINE_URL}/health`);
      const data = await r.json();
      return res.json(data);
    } catch {
      return res.status(503).json({ ok: false, error: 'engine_unreachable' });
    }
  }
  return res.status(503).json({ ok: false, error: 'engine_unavailable' });
});

app.post('/api/math/eval', async (req, res) => {
  const { expr } = req.body || {};
  if (typeof expr !== 'string') return res.status(400).json({ error: 'expr_required' });
  if (MATH_ENGINE_URL) {
    try {
      const r = await fetch(`${MATH_ENGINE_URL}/eval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expr }),
      });
      const data = await r.json();
      return res.json(data);
    } catch {
      return res.status(503).json({ error: 'engine_unreachable' });
    }
  }
  return res.status(503).json({ error: 'engine_unavailable' });
});

// --- Actions (stubs)
app.post('/api/actions/mint', requireAuth, (req, res) => {
  // TODO: integrate wallet; for now echo a stub tx id
  res.json({
    ok: true,
    minted: Number(req.body?.amount || 1),
    tx: 'rc_' + Math.random().toString(36).slice(2, 10),
  });
});

require('./modules/yjs_callback')({ app });
require('./modules/trust_curvature')({ app });
require('./modules/truth_diff')({ app });

app.use(contradictionLogger);

// --- Socket.IO presence (metrics)
io.on('connection', (socket) => {
  socket.emit('hello', { ok: true, t: Date.now() });
});
setInterval(() => {
  const total = os.totalmem(),
    free = os.freemem();
const metricsInterval = setInterval(() => {
  const total = os.totalmem(), free = os.freemem();
const metricsInterval = setInterval(() => {
  const total = os.totalmem(),
    free = os.freemem();
  const payload = {
    t: Date.now(),
    load: os.loadavg()[0],
    mem: { total, free, used: total - free, pct: 1 - free / total },
    cpuCount: os.cpus()?.length || 1,
    host: os.hostname(),
  };
  io.emit('metrics', payload);
}, 2000).unref();

function shutdown(done) {
  clearInterval(metricsInterval);
  io.close();
  return server.close(done);
}

server.on('close', () => {
  clearInterval(metricsInterval);
  io.close();
  db.close();
  for (const transport of logger.transports || []) {
    if (typeof transport.close === 'function') {
      transport.close();
    }
  }
});

// --- Start
server.listen(PORT, () => {
  logger.info({
    event: 'server_start',
    port: PORT,
    db: DB_PATH,
    llm: LLM_URL,
    shell: ALLOW_SHELL,
    debug: DEBUG_MODE,
  });
  console.log(
    `[blackroad-api] listening on ${PORT} (db: ${DB_PATH}, llm: ${LLM_URL}, shell: ${ALLOW_SHELL})`,
  );
});

// --- Safety
process.on('unhandledRejection', (e) => logger.error({ event: 'unhandled_rejection', error: String(e) }));
process.on('uncaughtException', (e) => logger.error({ event: 'uncaught_exception', error: String(e) }));

module.exports = { app, server, io, metricsInterval, shutdown };
