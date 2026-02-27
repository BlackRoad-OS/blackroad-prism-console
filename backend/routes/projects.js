'use strict';

const { addProject, getProject, getProjects } = require('../data');

function getAuthenticatedUserId(req) {
  // Assumes upstream authentication middleware populates req.user
  if (req && req.user) {
    return req.user.id || req.user.user_id || req.user.uid || null;
  }
  return null;
}

module.exports = function projectsRoute(router) {
  router.get('/api/projects', (req, res) => {
    const authUserId = getAuthenticatedUserId(req);
    if (!authUserId) {
      return res.status(401).json({ error: 'authentication required' });
    }
    const projects = getProjects(authUserId);
    res.json({ projects });
  });

  router.get('/api/projects/:id', (req, res) => {
    const authUserId = getAuthenticatedUserId(req);
    if (!authUserId) {
      return res.status(401).json({ error: 'authentication required' });
    }

    const project = getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'project not found' });
    }

    if (project.user_id && project.user_id !== authUserId) {
      return res.status(403).json({ error: 'forbidden' });
    }

    res.json({ project });
  });

  router.post('/api/projects', (req, res) => {
    const authUserId = getAuthenticatedUserId(req);
    if (!authUserId) {
      return res.status(401).json({ error: 'authentication required' });
    }

    const { name } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const project = addProject(authUserId, name);
    res.status(201).json({ project });
  });
};
