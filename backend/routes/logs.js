'use strict';

const express = require('express');
const { addLog, getLogs } = require('../data');

const router = express.Router();

// GET /api/logs - retrieve all logs
router.get('/', (_req, res) => {
  try {
    const logs = getLogs();
    return res.json({ logs });
  } catch (err) {
    return res.status(500).json({ error: 'failed to fetch logs' });
  }
});

// POST /api/logs - create a new log entry
router.post('/', (req, res) => {
  const { service, message } = req.body || {};

  if (!service || typeof service !== 'string' || !service.trim()) {
    return res.status(400).json({ error: 'service is required' });
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    addLog(service.trim(), message.trim());
    return res.status(201).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'failed to create log' });
  }
});

module.exports = function mountLogs(app) {
  app.use('/api/logs', router);
};
