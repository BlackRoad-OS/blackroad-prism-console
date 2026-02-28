-- FILE: /srv/blackroad-api/db/migrations/0003_subscribe_refactor.sql
PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS payments;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS plans (
  plan_id TEXT PRIMARY KEY,
  name TEXT,
  price_cents INTEGER,
  currency TEXT DEFAULT 'USD',
  interval TEXT DEFAULT 'month',
  features_json TEXT,
  rc_monthly_allowance INTEGER DEFAULT 0,
  limits_json TEXT,
  active INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_plans_active ON plans(active);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  status TEXT CHECK(status IN ('incomplete','active','past_due','canceled')) NOT NULL,
  current_period_start INTEGER,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER,
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  subscription_id TEXT,
  plan_id TEXT,
  amount_cents INTEGER,
  currency TEXT,
  provider TEXT,
  provider_ref TEXT,
  status TEXT CHECK(status IN ('created','paid','failed','refunded')),
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_sub ON payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE TABLE IF NOT EXISTS webhook_log (
  id TEXT PRIMARY KEY,
  provider TEXT,
  event_type TEXT,
  payload_json TEXT,
  received_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_webhook_provider ON webhook_log(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_event ON webhook_log(event_type);

CREATE TABLE IF NOT EXISTS entitlements (
  user_id TEXT PRIMARY KEY,
  plan_id TEXT,
  rc_monthly_allowance INTEGER,
  rc_monthly_used INTEGER DEFAULT 0,
  limits_json TEXT,
  refreshed_at INTEGER
);

CREATE VIEW IF NOT EXISTS active_subscriptions_v AS
  SELECT s.*, p.name, p.price_cents, p.currency, p.interval
  FROM subscriptions s JOIN plans p ON s.plan_id = p.plan_id
  WHERE s.status='active' AND s.current_period_end > strftime('%s','now');

-- Seed default plans (keep in sync with server_full.js DEFAULT_PLANS and pricing/catalog.yaml)
INSERT OR REPLACE INTO plans (plan_id,name,price_cents,currency,interval,features_json,rc_monthly_allowance,limits_json,active) VALUES
('free','Free',0,'USD','month','["1 project","1 agent","100 prompts/month","community support","500 MB storage"]',0,'{"tokens_per_day":1000,"projects":1,"agents":1,"storage_mb":500}',1),
('creator','Creator',900,'USD','month','["10 projects","5 agents","5,000 prompts/mo","priority queue","RoadCoin minting (basic)","10 GB storage"]',100,'{"tokens_per_day":10000,"projects":10,"agents":5,"storage_mb":10240}',1),
('pro','Pro',2900,'USD','month','["unlimited projects","20 agents","25,000 prompts/mo","Orchestrator (full)","Dashboard analytics","API access","100 GB storage"]',1000,'{"tokens_per_day":100000,"projects":-1,"agents":20,"storage_mb":102400}',1),
('enterprise','Enterprise',49900,'USD','month','["SSO/SAML","custom limits","private models","SLA","dedicated support","unlimited storage"]',10000,'{"tokens_per_day":1000000,"projects":-1,"agents":-1,"storage_mb":-1}',1),
('drive','Drive',499,'USD','month','["50 GB additional storage","RoadView asset hosting","version history (30 days)","shareable links","file preview"]',0,'{"storage_mb":51200}',1);
