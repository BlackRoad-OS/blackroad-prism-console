'use strict';

const request = require('supertest');

/**
 * Log in with test credentials and return the Set-Cookie headers.
 * Works with both a supertest `app` object and a base URL string.
 *
 * @param {import('express').Express|string} appOrUrl
 * @returns {Promise<string[]>}
 */
async function getAuthCookie(appOrUrl) {
  if (typeof appOrUrl === 'string') {
    // fetch-based path for node:test / URL-based tests
    const response = await fetch(`${appOrUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root', password: 'Codex2025' }),
    });
    if (response.status !== 200) {
      throw new Error(`getAuthCookie: login failed with status ${response.status}`);
    }
    const cookies = response.headers.getSetCookie?.() ?? [];
    if (cookies.length === 0) throw new Error('getAuthCookie: no session cookie returned');
    return cookies;
  }

  // supertest path
  const login = await request(appOrUrl)
    .post('/api/login')
    .send({ username: 'root', password: 'Codex2025' });
  return login.headers['set-cookie'];
}

module.exports = { getAuthCookie };
