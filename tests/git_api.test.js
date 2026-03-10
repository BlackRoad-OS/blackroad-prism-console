/* eslint-env node, jest */

process.env.SESSION_SECRET = 'test-secret'; // pragma: allowlist secret
process.env.INTERNAL_TOKEN = 'x';
process.env.ALLOW_ORIGINS = 'https://example.com';
process.env.GIT_REPO_PATH = process.cwd();
process.env.BR_TEST_DISABLE_DB = '1';
process.env.MATH_ENGINE_URL = '';
process.env.MINT_PK = '0x' + '11'.repeat(32);
process.env.CLAIMREG_ADDR = '0x' + '22'.repeat(20);

const request = require('supertest');
const { describe, it, expect, afterAll } = require('@jest/globals');
const { app, server } = require('../srv/blackroad-api/server_full.js');
const { getAuthCookie } = require('./helpers/auth');

describe('Git API', () => {
  afterAll((done) => {
    server.close(() => done());
  });

  it('returns git health info', async () => {
    const cookie = await getAuthCookie(app);
    const res = await request(app)
      .get('/api/git/health')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.repoPath).toBe('string');
    expect(res.body.readOnly).toBe(true);
  });

  it('returns git status info', async () => {
    const cookie = await getAuthCookie(app);
    const res = await request(app)
      .get('/api/git/status')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(typeof res.body.branch).toBe('string');
    expect(typeof res.body.shortHash).toBe('string');
    expect(typeof res.body.ahead).toBe('number');
    expect(typeof res.body.behind).toBe('number');
    expect(res.body.counts).toBeDefined();
    expect(res.body.counts).toHaveProperty('staged');
    expect(res.body.counts).toHaveProperty('unstaged');
    expect(res.body.counts).toHaveProperty('untracked');
    expect(typeof res.body.isDirty).toBe('boolean');
  });
});
