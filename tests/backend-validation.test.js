/* eslint-env node, jest */
process.env.NODE_ENV = 'test';
process.env.USE_SQLITE_MOCK = '1';
process.env.JWT_SECRET = 'test-secret';
jest.mock('better-sqlite3', () => require('./mocks/better-sqlite3.js'));

const request = require('supertest');
const { app } = require('../backend/server');

describe('Backend validation', () => {
  it('rejects malformed json and missing fields', async () => {
    const agent = request(app);

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'root', password: 'Codex2025' });

    expect(loginRes.status).toBe(200);
    const token = loginRes.body.token;
    expect(token).toBeDefined();

    const badRes = await agent
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send('{"title": "bad"');
    expect(badRes.status).toBe(400);

    const missingRes = await agent
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(missingRes.status).toBe(400);
  });

  it('returns json for not found routes', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.error).toBe('not found');
  });
});
