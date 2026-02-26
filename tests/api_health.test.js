/* eslint-env node, jest */
const process = require('node:process');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.INTERNAL_TOKEN = 'x';
process.env.ALLOW_ORIGINS = 'https://example.com';
process.env.MINT_PK = '0x' + '11'.repeat(32);
process.env.CLAIMREG_ADDR = '0x' + '22'.repeat(20);
process.env.ETH_RPC_URL = 'http://127.0.0.1:8545';
process.env.MATH_ENGINE_URL = '';
process.env.BR_TEST_DISABLE_DB = '1';

const fs = require('node:fs');
const path = require('node:path');

const originKeyPath = path.join(__dirname, 'origin.key');
fs.writeFileSync(originKeyPath, 'test-origin-key');
process.env.ORIGIN_KEY_PATH = originKeyPath;

const originHeaders = {
  'X-BlackRoad-Key': 'test-origin-key',
};

const request = require('supertest');
const { app, server } = require('../srv/blackroad-api/server_full.js');
const { getAuthCookie } = require('./helpers/auth');

describe('API security and health', () => {
  afterAll((done) => {
    server.close(() => {
      fs.rm(originKeyPath, { force: true }, () => done());
    });
  });

  it('responds to /health', async () => {
    const res = await request(app).get('/health').set(originHeaders);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('responds to /healthz', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('responds to /api/health with security headers', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://example.com');
    expect(res.status).toBe(200);
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://example.com'
    );
  });

  it('validates login payload', async () => {
    const res = await request(app)
      .post('/api/login')
      .set(originHeaders)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'missing_credentials' });
  });

  it('returns default entitlements for logged-in user', async () => {
    const cookie = await getAuthCookie(app);
    const res = await request(app)
      .get('/api/billing/entitlements/me')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.planName).toBe('Free');
    expect(res.body.entitlements.can.math.pro).toBe(false);
  });

  it('exposes seeded quantum research summaries', async () => {
    const list = await request(app).get('/api/quantum').set(originHeaders);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.topics)).toBe(true);
    expect(list.body.topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: 'reasoning' }),
        expect.objectContaining({ topic: 'memory' }),
        expect.objectContaining({ topic: 'symbolic' }),
      ])
    );

    const detail = await request(app)
      .get('/api/quantum/reasoning')
      .set(originHeaders);
    expect(detail.status).toBe(200);
    expect(detail.body).toEqual(
      expect.objectContaining({
        topic: 'reasoning',
      })
    );
    expect(detail.body.summary).toMatch(/Quantum/i);
  });

  it('reports math engine unavailable when not configured', async () => {
    const res = await request(app).get('/api/math/health').set(originHeaders);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, error: 'engine_unavailable' });
  });

  it('blocks math evaluation when engine is unavailable', async () => {
    const res = await request(app)
      .post('/api/math/eval')
      .set(originHeaders)
      .send({ expr: '2+2' });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'engine_unavailable' });
  });
});
