'use strict';

const {
  addTask,
  getTask,
  getTasks,
  getAllTasks,
  updateTask,
  deleteTask,
} = require('../data');

module.exports = function taskRoutes(router) {
  // GET /api/tasks - list tasks for the authenticated user's project
  router.get('/api/tasks', (req, res) => {
    const tasks = getTasks(req.auth.projectId);
    return res.json({ tasks });
  });

  // GET /api/tasks/:id - get a single task by id
  router.get('/api/tasks/:id', (req, res) => {
    const task = getTask(req.params.id);
    if (!task || task.project_id !== req.auth.projectId) {
      return res.status(404).json({ error: 'task_not_found' });
    }
    return res.json({ task });
  });

  // POST /api/tasks - create a new task
  router.post('/api/tasks', (req, res) => {
    const { title, status } = req.body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    const task = addTask(req.auth.projectId, title.trim(), status);
    return res.status(201).json({ task });
  });

  // PATCH /api/tasks/:id - update an existing task
  router.patch('/api/tasks/:id', (req, res) => {
    const task = getTask(req.params.id);
    if (!task || task.project_id !== req.auth.projectId) {
      return res.status(404).json({ error: 'task_not_found' });
    }

    const fields = {};
    if (typeof req.body?.title === 'string') {
      fields.title = req.body.title;
    }
    if (typeof req.body?.status === 'string') {
      fields.status = req.body.status;
    }

    const updated = updateTask(task.id, fields);
    return res.json({ task: updated });
  });

  // DELETE /api/tasks/:id - delete a task
  router.delete('/api/tasks/:id', (req, res) => {
    const task = getTask(req.params.id);
    if (!task || task.project_id !== req.auth.projectId) {
      return res.status(404).json({ error: 'task_not_found' });
    }

    deleteTask(task.id);
    return res.json({ ok: true });
  });
};
