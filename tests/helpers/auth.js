/**
 * Log in to the application and return the authentication cookie header.
 * Supports both supertest (Express app) and raw fetch (base URL string) usage.
 *
 * @param {import('express').Express|string} appOrBaseUrl - Express app instance or base URL string.
 * @param {object} [credentials]
 * @param {string} [credentials.username='root']
 * @param {string} [credentials.password='Codex2025']
 * @returns {Promise<string[]>} set-cookie headers from the login response.
 */
async function getAuthCookie(appOrBaseUrl, credentials = {}) {
  const { username = 'root', password = 'Codex2025' } = credentials;

  if (typeof appOrBaseUrl === 'string') {
    // Raw fetch mode (base URL string)
    const response = await fetch(`${appOrBaseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (response.status !== 200) {
      const message = await safeReadError(response);
      throw new Error(`failed to login: ${message}`);
    }

    const cookies = response.headers.getSetCookie?.() ?? [];
    if (cookies.length === 0) {
      throw new Error('failed to login: missing session cookie');
    }

    return cookies;
  }

  // Supertest mode (Express app)
  const request = require('supertest');
  const login = await request(appOrBaseUrl)
    .post('/api/login')
    .send({ username, password });

  if (!login.headers['set-cookie']) {
    throw new Error('failed to login: missing session cookie');
  }

  return login.headers['set-cookie'];
}

async function safeReadError(response) {
  try {
    const data = await response.json();
    if (data && typeof data.error === 'string') {
      return data.error;
    }
  } catch (_error) {
    // Ignore JSON parsing failures and fall back to status text.
  }
  return response.statusText || 'unknown error';
}

module.exports = { getAuthCookie };
