'use strict';

const { addTask, getTask, getTasks, getAllTasks, updateTask, deleteTask } = require('../data');

module.exports = function tasksRoute(router) {
  router.get('/api/tasks', (req, res) => {
    const { project_id } = req.query;
    const tasks = project_id ? getTasks(project_id) : getAllTasks();
    res.json({ tasks });
  });

  router.post('/api/tasks', (req, res) => {
    const { project_id, title, status } = req.body || {};
    if (!project_id || !title) {
      return res.status(400).json({ error: 'project_id and title are required' });
    }
    const task = addTask(project_id, title, status);
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
