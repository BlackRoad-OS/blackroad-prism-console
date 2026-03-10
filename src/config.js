'use strict';

const path = require('path');

require('dotenv').config();

const defaultRoadviewStorage = path.resolve(
  __dirname,
  '..',
  'storage',
  'roadview'
);

const cfg = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  DB_PATH: process.env.DB_PATH || '/srv/blackroad-api/blackroad.db',
  SESSION_SECRET: process.env.SESSION_SECRET || 'change-this-session-secret',
  JWT_SECRET: process.env.JWT_SECRET || 'change-this-jwt-secret',
  SOCKET_SECRET: process.env.SOCKET_SECRET || 'change-this-socket-secret',
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || null,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'root@blackroad.io',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Codex2025',
  ADMIN_NAME: process.env.ADMIN_NAME || 'Root',
  ENABLE_EXEC_ROUTES: /^true$/i.test(process.env.ENABLE_EXEC_ROUTES || 'false'),
  LUCIDIA_LLM_URL: process.env.LUCIDIA_LLM_URL || 'http://127.0.0.1:8000',
  DEPLOY_WEBHOOK_SECRET: process.env.DEPLOY_WEBHOOK_SECRET || null,
  ALLOW_DEPLOY_RUN: /^true$/i.test(process.env.ALLOW_DEPLOY_RUN || 'false'),
  LOG_DIR: process.env.LOG_DIR || null,
  // ROADCHAIN
  ROADCHAIN_MODE: process.env.ROADCHAIN_MODE || 'mock',
  ROADCHAIN_NETWORK: process.env.ROADCHAIN_NETWORK || 'mocknet',
  EVM_RPC_URL: process.env.EVM_RPC_URL || '',
  EVM_CHAIN_ID: parseInt(process.env.EVM_CHAIN_ID || '0', 10),
  ROADCHAIN_SIGNER_PRIVKEY: process.env.ROADCHAIN_SIGNER_PRIVKEY || '',
  ROADCHAIN_REGISTRY_ADDRESS: process.env.ROADCHAIN_REGISTRY_ADDRESS || '',
  ROADCHAIN_BADGE_ADDRESS: process.env.ROADCHAIN_BADGE_ADDRESS || '',
  ROADCHAIN_MAINNET_OK: /^true$/i.test(process.env.ROADCHAIN_MAINNET_OK || 'false'),
  ROADCHAIN_WEBHOOK_SECRET: process.env.ROADCHAIN_WEBHOOK_SECRET || 'change-me',
  ROADCHAIN_PUBLISH_LIMITS:
    process.env.ROADCHAIN_PUBLISH_LIMITS || '{"creator":3,"builder":30,"oracle":300}',
  ROADVIEW_STORAGE: path.resolve(
    process.env.ROADVIEW_STORAGE || defaultRoadviewStorage
  )
};

module.exports = cfg;
