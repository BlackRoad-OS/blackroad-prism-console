'use strict';
/* BlackRoad API — Express + SQLite + Socket.IO + LLM bridge
   Runs behind Nginx on port 4000 with cookie-session auth.
   Env (optional):
     PORT=4000
     SESSION_SECRET=change_me
     DB_PATH=/srv/blackroad-api/blackroad.db
     LLM_URL=http://127.0.0.1:8000/chat
     ALLOW_SHELL=false
*/


/**
 * BlackRoad API — Express + SQLite + Socket.IO + LLM bridge
 * Runs behind Nginx on port 4000 with cookie-session auth.
 */

require('dotenv').config();

const compression = require('compression');

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieSession = require('cookie-session');
const { randomUUID } = require('crypto');
const { body, validationResult } = require('express-validator');

const morgan = require('morgan');
const { createDatabase } = require('./lib/sqlite');
const { Server: SocketIOServer } = require('socket.io');
const { exec } = require('child_process');
const EventEmitter = require('events');
const Stripe = require('stripe');
const { verifyToken } = require('./lib/verify');
// const verify = require('./lib/verify');  // unused
const notify = require('./lib/notify');
const logger = require('./lib/log');
const attachLlmRoutes = require('./routes/admin_llm');
const gitRouter = require('./routes/git');
const providersRouter = require('./routes/providers');

// Custom environment variable loader replaces the standard 'dotenv' package.
// Rationale: We use a custom loader to reduce external dependencies, avoid issues with dotenv's parsing logic,
// and to allow for more controlled loading (e.g., skipping variables already set in process.env).
// See coding guidelines: dependency changes must be documented.
function loadEnvFile() {
  const envPath = process.env.DOTENV_PATH || path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
      const value = line.slice(idx + 1).trim();
      process.env[key] = value;
    }
  } catch (error) {
    if (process.env.LOG_LEVEL !== 'silent') {
      console.warn(`Failed to load env file: ${error.message}`);
    }
  }
}

// --- Config
const { enforceSecurityDefaults } = require('./lib/securityDefaults.cjs');

const disableDbFlag = String(
  process.env.BR_TEST_DISABLE_DB || process.env.BRC_DISABLE_NATIVE_DB || ''
).toLowerCase();
const SHOULD_DISABLE_DB = disableDbFlag === '1' || disableDbFlag === 'true';

let Database;
if (!SHOULD_DISABLE_DB) {
  try {
    Database = require('better-sqlite3');
  } catch (err) {
    console.warn(
      'better-sqlite3 unavailable, using mock DB for API server:',
      err
    );
  }
}

function createMockDb() {
  const noop = () => {};
  return {
    pragma: noop,
    exec: noop,
    close: noop,
    prepare() {
      return {
        run: () => ({ lastInsertRowid: 0, changes: 0 }),
        get: () => undefined,
        all: () => [],
        iterate: function* iterate() {},
      };
    },
  };
}

const usingMockDb = !Database;
const TABLES = ['projects', 'agents', 'datasets', 'models', 'integrations'];

['SESSION_SECRET', 'INTERNAL_TOKEN'].forEach((name) => {
  if (!process.env[name]) {
    console.error(`Missing required env ${name}`);
    process.exit(1);
  }
});

loadEnvFile();

const REQUIRED_ENV = ['SESSION_SECRET', 'INTERNAL_TOKEN', 'ALLOW_ORIGINS'];
const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missingEnv.length) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(', ')}`);
}

const verify = require('./lib/verify');
const git = require('./lib/git');
const deploy = require('./lib/deploy');
const { fetchWithProbe } = require('./lib/fetch_probe');
const { DB_PATH: libraryDbPath } = require('./lib/db');
const { TernaryError } = require('./lib/ternaryError');
const attachDebugProbes = require('./modules/debug_probes');
const maintenanceGuard = require('./modules/maintenanceGuard');
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

let securityDefaults;
try {
  securityDefaults = enforceSecurityDefaults({ env: process.env, logger });
} catch (error) {
  if (error && error.code === 'SECURITY_DEFAULTS') process.exit(1);
  throw error;
}

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

const safeAttach = (label, attachFn) => {
  try {
    attachFn();
  } catch (err) {
    console.warn(`[bootstrap] ${label} module disabled: ${err.message}`);
  }
};
const rateLimit = require('express-rate-limit');

const execFileAsync = promisify(execFile);

const isTestEnv =
  process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

function parseAllowedOrigins() {
  return (process.env.ALLOW_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

const allowedOrigins = parseAllowedOrigins();

function buildCorsOptions() {
  if (allowedOrigins.length === 0) {
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

const app = express();
// Trust first proxy (e.g., Nginx) so secure headers like HSTS work behind TLS terminators
app.set('trust proxy', 1);
require('./modules/jsonEnvelope')(app);
require('./modules/requestGuard')(app);
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  path: '/socket.io',
  serveClient: false,
  cors: { origin: false }, // same-origin via Nginx
});

app.set('trust proxy', 1);

app.use((req, res, next) => {
  const provided = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null;
  const id = provided || randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  const started = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - started;
    const logLine = JSON.stringify({
      event: 'request',
      id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs,
    });
    if (process.env.LOG_LEVEL !== 'silent') {
      console.info(logLine);
    }
  });
  next();
});

// Partner relay for mTLS-authenticated teammates
require('./modules/partner_relay_mtls')({ app });
require('./modules/projects')({ app });
require('./modules/pr_proxy')({ app });
require('./modules/patentnet')({ app });
safeAttach('truth_pubsub', () => require('./modules/truth_pubsub')({ app }));
safeAttach('trust_graph', () => require('./modules/trust_graph')({ app }));

// Truth quorum subscriber
;(async () => {
  try {
    await require('./modules/truth_quorum')({ app });
  } catch (e) {
    console.error(e);
  }
})();

const emitter = new EventEmitter();
const jobs = new Map();
let jobSeq = 0;

function addJob(type, payload, runner) {
  const id = String(++jobSeq);
  const job = { id, type, payload, status: 'queued', created: Date.now(), logs: [] };
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
  return id;
}

require('./modules/love_math')({ app });
safeAttach('jobs', () => require('./modules/jobs')({ app }));
safeAttach('memory', () => require('./modules/memory')({ app }));
require('./modules/brain_chat')({ app });
safeAttach('jobs_locked', () => require('./modules/jobs_locked')({ app }));
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
app.use(
  helmet.hsts({
    maxAge: 60 * 60 * 24 * 365,
    includeSubDomains: true,
    preload: true,
  }),
);
app.use(helmet.referrerPolicy({ policy: 'no-referrer' }));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOW_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  }),
);

app.use(
  rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

const resolveClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  // Express normalizes headers to strings but may surface arrays when the
  // header is supplied multiple times by intermediaries.
  const extractFirst = (value) => {
    if (typeof value !== 'string' || value.length === 0) return null;
    const first = value.split(',')[0]?.trim();
    return first || null;
  };
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    const fromArray = extractFirst(forwarded[0]);
    if (fromArray) return fromArray;
  }
  const fromHeader = extractFirst(forwarded);
  if (fromHeader) return fromHeader;
  return req.socket?.remoteAddress || req.ip;
};

const loginLimiter = rateLimit({
  windowMs: 5 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: resolveClientIp,
  handler: (req, res) => {
    const ip = resolveClientIp(req);
    logger.warn({ event: 'login_rate_limited', ip });
    res.status(429).json({ error: 'too_many_attempts' });
  },
});
app.use((req, res, next) => {
  const id = randomUUID();
  req.id = id;
  const start = Date.now();
  res.on('finish', () => {
    logger.info({ id, method: req.method, path: req.originalUrl, status: res.statusCode, duration: Date.now() - start });
  });
  next();
});
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors(buildCorsOptions()));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

let stripe = null;
if (process.env.STRIPE_SECRET) {
  try {
    stripe = new Stripe(process.env.STRIPE_SECRET, {
      apiVersion: '2023-10-16',
    });
  } catch (err) {
    console.warn('[blackroad-api] failed to init Stripe client:', err.message);
  }
}

const rawJsonParser = express.raw({ type: 'application/json' });
app.post('/api/billing/webhook', rawJsonParser, (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'webhook_unconfigured' });
  }
  const signature = req.get('Stripe-Signature');
  try {
    stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    return res.json({ received: true });
  } catch (err) {
    return res
      .status(400)
      .json({ error: 'invalid_signature', detail: err.message });
  }
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  cookieSession({
    name: 'brsid',
    secret: process.env.SESSION_SECRET || 'dev-session-secret',
    httpOnly: true,
    sameSite: 'lax',
    secure: NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8,
    maxAge: 1000 * 60 * 60 * 8, // 8h
    secure: !isTestEnv && process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
);

const originKey = (() => {
  if (!process.env.ORIGIN_KEY_PATH) return null;
  try {
    return fs
      .readFileSync(path.resolve(process.env.ORIGIN_KEY_PATH), 'utf8')
      .trim();
  } catch (err) {
    console.warn('[blackroad-api] unable to read origin key:', err.message);
    return null;
  }
})();

function shouldEnforceOriginKey(req) {
  if (!originKey) return false;
  const origin = req.get('Origin');
  return typeof origin === 'string' && origin.length > 0;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'blackroad-api', ts: new Date().toISOString() });
});
app.use((req, _res, next) => {
  const bearer = req.get('authorization');
  const headerToken =
    req.get('x-internal-token') ||
    (typeof bearer === 'string' ? bearer.replace(/^Bearer\s+/i, '') : '');
  if (headerToken && verifyToken(headerToken, INTERNAL_TOKEN)) {
    req.internal = true;
  }
  next();
});

// --- Homepage
app.get('/', (_, res) => {
  res.sendFile(path.join(WEB_ROOT, 'index.html'));
});
function sendHealth(_req, res) {
  res.json({ ok: true, version: '1.0.0', uptime: process.uptime() });
}
app.head('/health', (_req, res) => res.status(200).end());
app.get('/health', sendHealth);
app.head('/healthz', (_req, res) => res.status(200).end());
app.get('/healthz', sendHealth);

// --- Health
app.head('/api/health', (_, res) => res.status(200).end());
app.get('/api/health', async (_req, res) => {
  let llm = false;
  try {
    const r = await fetch('http://127.0.0.1:8000/health');
    llm = r.ok;
  } catch (err) {
    logger.warn({ event: 'health_llm_check_failed', error: err.message });
    logger.warn('health_llm_check_failed', { error: String(err) });
  }
  res.json({
    ok: true,
    version: '1.0.0',
    uptime: process.uptime(),
    services: { api: true, llm },
  });
});
function ensureOriginKey(req, res, next) {
  if (!shouldEnforceOriginKey(req)) return next();
  if (req.get('X-BlackRoad-Key') === originKey) return next();
  return res.status(401).json({ error: 'invalid_origin_key' });
}

app.use('/api', ensureOriginKey);

function isMaintenanceMode() {
  const raw = String(process.env.AUTOPAL_GLOBAL_ENABLED || '')
    .trim()
    .toLowerCase();
  if (!raw) return false;
  return raw === 'false' || raw === '0' || raw === 'off';
}

const maintenancePayload = {
  code: 'maintenance_mode',
  message: 'AutoPal is paused by ops.',
  hint: 'Try again later or use runbooks.',
  runbook: 'https://runbooks/autopal/maintenance',
};

app.use((req, res, next) => {
  if (!isMaintenanceMode()) return next();

  res.set('x-autopal-mode', 'maintenance');

  const now = new Date().toISOString();
  if (req.path === '/health' || req.path === '/health/live') {
    res.set('cache-control', 'max-age=10');
    return res.json({ status: 'ok', ts: now });
  }
  if (req.path === '/health/ready') {
    return res.json({ status: 'ok', ts: now });
  }
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

  if (req.method === 'GET') {
    res.set('Retry-After', '60');
  }
  return res.status(503).json(maintenancePayload);
});

function nowIso() {
  return new Date().toISOString();
}

// --- Auth (cookie-session)
function extractInternalToken(req) {
  const headerToken = req.get('x-internal-token');
  if (headerToken) return headerToken.trim();
  const authHeader = req.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

function grantInternalSession(req) {
  if (!req.session) req.session = {};
  if (!req.session.user) {
    req.session.user = {
      username: 'internal-service',
      role: 'system',
      plan: 'enterprise',
    };
  }
  req.session.user.internal = true;
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  const token = extractInternalToken(req);
  if (token && verifyToken(token, INTERNAL_TOKEN)) {
    grantInternalSession(req);
    return next();
  }
  return res.status(401).json({ error: 'unauthorized' });
}

app.get('/api/session', (req, res) => {
  res.json({ user: req.session?.user || null });
});

app.post(
  '/api/login',
  [body('username').isString().trim().notEmpty(), body('password').isString()],
  loginLimiter,
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'invalid_request', details: errors.array() });
    }

    const { username, password } = req.body;
    const bypass = String(process.env.BYPASS_LOGIN || 'false').toLowerCase() === 'true';
    const validDevLogin = username === 'root' && password === 'Codex2025';

    if (!validDevLogin && !bypass) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    req.session.user = { username, role: 'dev', plan: 'free' };
    return res.json({ ok: true, user: req.session.user });
  },
);

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.use('/api/git', requireAuth, gitRouter);

app.use(express.static(WEB_ROOT));

app.use((err, req, res, _next) => {
  const status = err.message === 'Not allowed by CORS' ? 403 : err.status || 500;
  const payload = {
    error: err.code || 'internal_error',
    message: err.message,
    requestId: req.requestId,
  };
  if (status >= 500 && process.env.LOG_LEVEL !== 'silent') {
    console.error(JSON.stringify({ event: 'error', requestId: req.requestId, message: err.message }));
  }
  res.status(status).json(payload);
});

app.post('/api/billing/webhook', (req, res) => {
  if (!stripeClient || !STRIPE_WEBHOOK_SECRET) {
    return res.status(501).json({ error: 'stripe_unconfigured' });
  }
  const sig = req.headers['stripe-signature'];
  let _event;
  try {
    _event = stripeClient.webhooks.constructEvent(
      JSON.stringify(req.body),
      sig,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    logger.error('stripe_webhook_verify_failed', e);
    return res.status(400).json({ error: 'invalid_signature' });
  }
  logger.info('stripe_webhook_received', {
    id: _event.id,
    type: _event.type,
  });
  res.json({ received: true });
});

// --- SQLite bootstrap
if (!usingMockDb) {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  } catch {}
}

const db = usingMockDb ? createMockDb() : new Database(DB_PATH);

if (!usingMockDb) {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

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
    ).run();
  }

  // Subscription tables
  db.prepare(
    `
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
}

function start(port = PORT) {
  if (!server.listening) {
    server.listen(port);
  }
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
    for (const p of defaultPlans) {
      stmt.run(p.id, p.name, p.monthly, p.yearly, JSON.stringify(p.features));
    }
  }

  // Quantum AI table seed
  db.prepare(
    `
  CREATE TABLE IF NOT EXISTS quantum_ai (
    topic TEXT PRIMARY KEY,
    summary TEXT NOT NULL
  )
`
  ).run();
  const qSeed = [
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
  return server;
}

if (process.env.JEST_WORKER_ID) {
  start(0);
} else if (require.main === module) {
  start();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: nowIso() });
});

app.get('/health/live', (_req, res) => {
  res.json({ status: 'ok', ts: nowIso() });
});

app.get('/health/ready', (_req, res) => {
  res.json({ status: 'ok', ts: nowIso() });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), ts: nowIso() });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'missing_credentials' });
  }
  if (username !== 'root' || password !== 'Codex2025') {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  req.session.user = { id: 'root', username: 'root', roles: ['admin'] };
  return res.json({ ok: true, user: { username: 'root' } });
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

const DEFAULT_ENTITLEMENTS = {
  planName: 'Free',
  entitlements: {
    can: {
      math: { pro: false },
      llm: { pro: true },
    },
    limits: {
      chat: 500,
      storageGb: 5,
    },
  },
};

app.get('/api/billing/entitlements/me', requireAuth, (_req, res) => {
  res.json(DEFAULT_ENTITLEMENTS);
});

app.get('/api/trust/curvature', (_req, res) => {
  res.json([
    { u: 'a', v: 'b', kappa: 0.42 },
    { u: 'b', v: 'c', kappa: 0.37 },
  ]);
});

app.get('/api/truth/diff', (_req, res) => {
  res.json({
    ctd: 1,
    ops: [
      { op: 'replace', path: '/meta/title', lhs: 'Truth A', rhs: 'Truth B' },
      { op: 'add', path: '/meta/tags/-', value: 'insight' },
    ],
  });
});

app.get('/api/connectors/status', (_req, res) => {
  res.json({
    config: {
      stripe: false,
      mail: false,
      sheets: false,
      calendar: false,
      discord: false,
      webhooks: false,
    },
    live: {
      slack: false,
      airtable: false,
      linear: false,
      salesforce: false,
    },
  });
});

const QUANTUM_TOPICS = [
  {
    topic: 'reasoning',
    summary:
      'Quantum reasoning models blend symbolic search with qubit annealing.',
  },
  {
    topic: 'memory',
    summary:
      'Persistent entanglement enables long-horizon recall of agent sessions.',
  },
  {
    topic: 'symbolic',
    summary:
      'Hybrid symbolic/quantum theorem provers unlock interpretable planning.',
  },
];
for (const row of QUANTUM_TOPICS) {
  db.prepare(
    'INSERT OR IGNORE INTO quantum_ai (topic, summary) VALUES (?, ?)'
  ).run(row.topic, row.summary);
}
attachSlackExceptions({ app, db });

// Git API
app.use('/api/git', requireAuth, gitRouter);
app.use('/v1/providers', providersRouter);

app.get('/api/quantum', (_req, res) => {
  res.json({ topics: QUANTUM_TOPICS });
});

app.get('/api/quantum/:topic', (req, res) => {
  const detail = QUANTUM_TOPICS.find(
    (entry) => entry.topic === req.params.topic
  );
  if (!detail) {
    return res.status(404).json({ error: 'unknown_topic' });
  }
  return res.json({ ...detail, ts: nowIso() });
});

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
  res.status(501).json({ error: 'not_implemented' });
});

app.get('/api/math/health', (_req, res) => {
  const hasEngine = Boolean(process.env.MATH_ENGINE_URL);
  if (!hasEngine) {
    return res.status(503).json({ ok: false, error: 'engine_unavailable' });
  }
  return res.json({ ok: true, engine: process.env.MATH_ENGINE_URL });
});

app.post('/api/math/eval', (req, res) => {
  const hasEngine = Boolean(process.env.MATH_ENGINE_URL);
  if (!hasEngine) {
    return res.status(503).json({ error: 'engine_unavailable' });
  }
  const { expr } = req.body || {};
  if (typeof expr !== 'string') {
    return res.status(400).json({ error: 'expr_required' });
  }
  try {
    const value = eval(expr);
    return res.json({ ok: true, value });
  } catch (err) {
    return res
      .status(400)
      .json({ error: 'invalid_expression', detail: err.message });
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

const PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    models: ['gpt-4o', 'o3-mini'],
    capabilities: ['chat', 'embeddings'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: ['claude-3.5-sonnet'],
    capabilities: ['chat'],
  },
];

app.get('/v1/providers', (_req, res) => {
  res.json(PROVIDERS);
});

app.get('/v1/providers/:id/health', (req, res) => {
  const provider = PROVIDERS.find((item) => item.id === req.params.id);
  if (!provider) {
    return res.status(404).json({ error: 'provider_not_found' });
  }
  if (!STRIPE_SECRET) {
    return res.status(409).json({ mode: 'invoice' });
  }
  // Stripe integration would go here
  res.json({ url: 'https://stripe.example/checkout' });
});

app.post('/api/subscribe/invoice-intent', (req, res) => {
  const { plan, cycle, email, name, company } = req.body || {};
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
      } catch (err) {
        logger.warn('plan_features_parse_failed', {
          planId: r.id,
          error: String(err),
        });
        r.features = [];
      }
    }
    res.json({ plans: rows });
  } catch (err) {
    logger.warn('subscribe_plans_failed', { error: String(err) });
    res.status(500).json({ error: 'server_error' });
  }
});

const MAX_REQUEST_BODY_SIZE = 1 * 1024 * 1024; // 1MB

function parseAllowedOrigins(value = '') {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseCookies(header = '') {
  return header
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const [key, value] = pair.split('=');
      if (key) {
        acc[key] = value ?? '';
      }
      return acc;
    }, {});
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  Object.entries(extraHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  res.end(JSON.stringify(payload));
}

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > MAX_REQUEST_BODY_SIZE) {
        const error = new Error('payload too large');
        error.statusCode = 413;
        reject(error);
        req.destroy(error);
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function getJsonBody(req, res, { allowEmpty = false } = {}) {
  let raw;
  try {
    raw = await readRequestBody(req);
  } catch (error) {
    if (!res.writableEnded) {
      const statusCode = error.statusCode === 413 ? 413 : 400;
      const errorMessage = statusCode === 413 ? 'payload too large' : 'invalid json';
      sendJson(res, statusCode, { error: errorMessage });
    }
    return { ok: false };
  }

  if (!raw) {
    if (allowEmpty) {
      return { ok: true, body: null };
    }
    sendJson(res, 400, { error: 'request body required' });
    return { ok: false };
  }

  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch (error) {
    if (!res.writableEnded) {
      sendJson(res, 400, { error: 'invalid json' });
    }
    return { ok: false };
  }
}

function createServer({
  allowedOrigins = [],
  sessionSecret = undefined,
} = {}) {
  void sessionSecret;
  const sessions = new Map();
  const tasks = [];
  const VALID_USER = { username: 'root', password: 'Codex2025' };

  const server = http.createServer(async (req, res) => {
    const requestId = randomUUID();
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-dns-prefetch-control', 'off');
    res.setHeader('x-frame-options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }

    const url = new URL(req.url, 'http://localhost');

    if (
      req.method === 'OPTIONS' &&
      ['/api/login', '/api/tasks'].includes(url.pathname) &&
      origin &&
      allowedOrigins.includes(origin)
    ) {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, uptime: process.uptime() });
    }

    if (req.method === 'POST' && url.pathname === '/api/login') {
      const { ok, body } = await getJsonBody(req, res);
      if (!ok) {
        return undefined;
      }

      if (!body || typeof body !== 'object') {
        return sendJson(res, 400, { error: 'invalid json payload' });
      }

      if (body.username === VALID_USER.username && body.password === VALID_USER.password) {
        const sessionId = randomUUID();
        sessions.set(sessionId, { username: VALID_USER.username });
        return sendJson(res, 200, { ok: true }, {
          'Set-Cookie': `session=${sessionId}; HttpOnly; Path=/; SameSite=Lax`,
        });
      }
      return sendJson(res, 401, { error: 'invalid credentials' });
    }

    const cookies = parseCookies(req.headers.cookie);
    const session = cookies.session ? sessions.get(cookies.session) : undefined;

    if (req.method === 'POST' && url.pathname === '/api/tasks') {
      if (!session) {
        return sendJson(res, 401, { error: 'unauthorized' });
      }

      const { ok, body } = await getJsonBody(req, res);
      if (!ok) {
        return undefined;
      }

      if (!body || typeof body !== 'object') {
        return sendJson(res, 400, { error: 'invalid json payload' });
      }

      if (typeof body.title !== 'string' || body.title.trim() === '') {
        return sendJson(res, 400, { error: 'invalid task' });
      }
      const task = { id: tasks.length + 1, title: body.title.trim() };
      tasks.push(task);
      return sendJson(res, 201, { ok: true, task });
    }

    if (req.method === 'GET' && url.pathname === '/api/tasks') {
      if (!session) {
        return sendJson(res, 401, { error: 'unauthorized' });
      }
      return sendJson(res, 200, { tasks });
    }

    return sendJson(res, 404, { error: 'not found' });
  });

  return { server };
}

app.get('/api/git/status', requireAuth, async (_req, res) => {
  try {
    const [branchRaw, statusRaw] = await Promise.all([
      runGit(['rev-parse', '--abbrev-ref', 'HEAD']),
      runGit(['status', '--porcelain']),
    ]);
    const branch = branchRaw.trim();
    const counts = computeCounts(statusRaw);
    const isDirty = Object.values(counts).some((value) => value > 0);
    res.json({ ok: !isDirty, branch, counts, isDirty });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

// --- Socket.IO presence (metrics)
io.on('connection', (socket) => {
  socket.emit('hello', { ok: true, t: Date.now() });
});
const metricsTimer = setInterval(() => {
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
}, 2000);

// --- Start
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(
      `[blackroad-api] listening on ${PORT} (db: ${DB_PATH}, llm: ${LLM_URL}, shell: ${ALLOW_SHELL})`
    );
  });
}
(async () => {
  try {
    await require('./modules/truth_pubsub')({ app });
  } catch (err) {
    console.error('truth_pubsub init failed', err);
    throw err;
  }
  require('./modules/yjs_callback')({ app });

  // --- Socket.IO presence (metrics)
  io.on('connection', (socket) => {
    socket.emit('hello', { ok: true, t: Date.now() });
  });
  setInterval(() => {
    const total = os.totalmem(), free = os.freemem();
    const payload = {
      t: Date.now(),
      load: os.loadavg()[0],
      mem: { total, free, used: total - free, pct: 1 - free / total },
      cpuCount: os.cpus()?.length || 1,
      host: os.hostname(),
    };
    io.emit('metrics', payload);
  }, 2000);

  // --- Start
  if (require.main === module) {
    server.listen(PORT, () => {
      console.log(
        `[blackroad-api] listening on ${PORT} (db: ${DB_PATH}, llm: ${LLM_URL}, shell: ${ALLOW_SHELL})`
      );
    });
  }

  // --- Safety
  process.on('unhandledRejection', (e) => console.error('UNHANDLED', e));
  process.on('uncaughtException', (e) => console.error('UNCAUGHT', e));
})();

function shutdown(done) {
  clearInterval(metricsTimer);
  server.close(done);
}

module.exports = { app, server, start, shutdown, loginLimiter, INTERNAL_TOKEN, ALLOW_ORIGINS };
