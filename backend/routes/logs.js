'use strict';

const { addLog, getLogs } = require('../data');

module.exports = function logsRoute(router) {
  router.get('/api/logs', (req, res) => {
    const logs = getLogs();
    res.json({ logs });
  });

  router.post('/api/logs', (req, res) => {
    const { service, message } = req.body || {};
    if (!service || !message) {
      return res.status(400).json({ error: 'service and message are required' });
    }
    addLog(service, message);
    res.status(201).json({ ok: true });
  });
};
