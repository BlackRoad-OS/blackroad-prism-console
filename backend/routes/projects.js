'use strict';

const { addProject, getProject, getProjects } = require('../data');

module.exports = function projectsRoute(router) {
  router.get('/api/projects', (req, res) => {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }
    const projects = getProjects(user_id);
    res.json({ projects });
  });

  router.get('/api/projects/:id', (req, res) => {
    const project = getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'project not found' });
    }
    res.json({ project });
  });

  router.post('/api/projects', (req, res) => {
    const { user_id, name } = req.body || {};
    if (!user_id || !name) {
      return res.status(400).json({ error: 'user_id and name are required' });
    }
    const project = addProject(user_id, name);
    res.status(201).json({ project });
  });
};
