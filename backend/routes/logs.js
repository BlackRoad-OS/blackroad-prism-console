'use strict';

const { addLog, getLogs } = require('../data');

module.exports = function logsRoutes(router) {
  router.get('/api/logs', (req, res) => {
    try {
      const logs = getLogs();
      return res.json({ logs });
    } catch (err) {
      return res.status(500).json({ error: 'failed_to_fetch_logs' });
    }
  });

  router.post('/api/logs', (req, res) => {
    const { service, message } = req.body || {};
    if (!service || typeof service !== 'string' || !service.trim()) {
      return res.status(400).json({ error: 'missing_service' });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'missing_message' });
    }
    try {
      addLog(service.trim(), message.trim());
      return res.status(201).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'failed_to_add_log' });
    }
  });
};
