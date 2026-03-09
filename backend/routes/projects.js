'use strict';

const express = require('express');
const { addProject, getProject, getProjects } = require('../data');

const router = express.Router();

// GET /api/projects - list projects for the authenticated user
router.get('/', (req, res) => {
  const userId = req.auth && req.auth.userId;
  if (!userId) {
    return res.status(401).json({ error: 'missing user context' });
  }

  try {
    const projects = getProjects(userId);
    return res.json({ projects });
  } catch (err) {
    return res.status(500).json({ error: 'failed to fetch projects' });
  }
});

// GET /api/projects/:id - get a single project
router.get('/:id', (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'project not found' });
    }
    return res.json({ project });
  } catch (err) {
    return res.status(500).json({ error: 'failed to fetch project' });
  }
});

// POST /api/projects - create a new project
router.post('/', (req, res) => {
  const { name } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const userId = req.auth && req.auth.userId;
  if (!userId) {
    return res.status(401).json({ error: 'missing user context' });
  }

  try {
    const project = addProject(userId, name.trim());
    return res.status(201).json({ project });
  } catch (err) {
    return res.status(500).json({ error: 'failed to create project' });
  }
});

module.exports = function mountProjects(app) {
  app.use('/api/projects', router);
};
