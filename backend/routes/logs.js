'use strict';

const { addLog, getLogs } = require('../data');

// Middleware to restrict access to internal/admin callers for logs routes.
// Uses a shared secret provided via the INTERNAL_LOGS_TOKEN environment variable.
function requireInternalLogsAuth(req, res, next) {
  const configuredToken = process.env.INTERNAL_LOGS_TOKEN;

  // If no token is configured, fall back to allowing access (useful for local/dev).
  if (!configuredToken) {
    return next();
  }

  const providedToken = req.headers['x-internal-token'];
  if (!providedToken || providedToken !== configuredToken) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
}

const MAX_SERVICE_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 2000;

module.exports = function logsRoute(router) {
  router.get('/api/logs', requireInternalLogsAuth, (req, res) => {
    const logs = getLogs();
    res.json({ logs });
  });

  router.post('/api/logs', requireInternalLogsAuth, (req, res) => {
    const { service, message } = req.body || {};

    const serviceStr = typeof service === 'string' ? service.trim() : '';
    const messageStr = typeof message === 'string' ? message.trim() : '';

    if (!serviceStr || !messageStr) {
      return res.status(400).json({ error: 'service and message are required' });
    }

    if (serviceStr.length > MAX_SERVICE_LENGTH) {
      return res.status(400).json({ error: `service must be at most ${MAX_SERVICE_LENGTH} characters` });
    }

    if (messageStr.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `message must be at most ${MAX_MESSAGE_LENGTH} characters` });
    }

    addLog(serviceStr, messageStr);
    res.status(201).json({ ok: true });
  });
};
