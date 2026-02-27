'use strict';

const { addTask, getTask, getTasks, updateTask, deleteTask } = require('../data');

module.exports = function tasksRoute(router) {
  router.get('/api/tasks', (req, res) => {
    const { project_id } = req.query;
    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }
    const tasks = getTasks(project_id);
    res.json({ tasks });
  });

  router.post('/api/tasks', (req, res) => {
    const { title, status } = req.body || {};
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (status !== undefined && typeof status !== 'string') {
      return res.status(400).json({ error: 'status must be a string if provided' });
    }
    const task = addTask(undefined, title, status);
    res.status(201).json({ task });
  });

  router.patch('/api/tasks/:id', (req, res) => {
    const existing = getTask(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'task not found' });
    }
    const fields = {};
    if (typeof req.body?.title === 'string') {
      fields.title = req.body.title;
    }
    if (typeof req.body?.status === 'string') {
      fields.status = req.body.status;
    }
    const task = updateTask(req.params.id, fields);
    res.json({ task });
  });

  router.delete('/api/tasks/:id', (req, res) => {
    const existing = getTask(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'task not found' });
    }
    deleteTask(req.params.id);
    res.json({ ok: true });
  });
};
