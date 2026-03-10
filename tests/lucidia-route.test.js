/* eslint-env node, jest */
const express = require('express');
const request = require('supertest');
const { describe, it, expect } = require('@jest/globals');

process.env.BR_TEST_DISABLE_DB = '1';

// Mock native dependencies that may not be installed
jest.mock('bcrypt', () => ({
  hash: jest.fn(async (pwd, _rounds) => 'hashed:' + pwd),
  compare: jest.fn(async (pwd, hash) => hash === 'hashed:' + pwd),
}), { virtual: true });

jest.mock('../src/auth', () => ({
  requireAuth: (_req, _res, next) => next(),
  generateToken: () => 'mock-token',
}));

const lucidia = require('../src/routes/lucidia');

describe('Lucidia routes', () => {
  it('GET /lucidia/health responds with ok payload', async () => {
    const app = express();
    app.use('/lucidia', lucidia);

    const res = await request(app).get('/lucidia/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'lucidia' });
  });
});
