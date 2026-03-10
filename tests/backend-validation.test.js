/* eslint-env node, jest */

// Set env before requiring the server
process.env.SESSION_SECRET = 'test-secret';
process.env.INTERNAL_TOKEN = 'x';
process.env.ALLOW_ORIGINS = 'https://example.com';
process.env.BR_TEST_DISABLE_DB = '1';
process.env.MATH_ENGINE_URL = '';

const request = require('supertest');
const { describe, it, expect, afterAll } = require('@jest/globals');
const { app, server } = require('../srv/blackroad-api/server_full.js');
const { getAuthCookie } = require('./helpers/auth');

describe('Backend validation', () => {
  afterAll((done) => {
    server.close(() => done());
  });

  it('returns 400 for malformed JSON body on POST /api/tasks', async () => {
    const cookie = await getAuthCookie(app);
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"title": "bad"');
    expect(res.status).toBe(400);
  });

  it('returns 400 when title is missing from POST /api/tasks', async () => {
    const cookie = await getAuthCookie(app);
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', cookie)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('title_required');
  });

  it('returns 404 JSON for unknown routes', async () => {
    const res = await request(app).get('/totally/unknown');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error).toBe('not_found');
  });

  it('returns 201 and task on successful POST /api/tasks', async () => {
    const cookie = await getAuthCookie(app);
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', cookie)
      .send({ title: 'Ship secure endpoint' });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.task.title).toBe('Ship secure endpoint');
  });
});
