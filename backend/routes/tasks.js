'use strict';

const express = require('express');
const { addTask, getTask, getTasks, updateTask, deleteTask } = require('../data');

const router = express.Router();

// GET /api/tasks - list tasks for the authenticated user's project
router.get('/', (req, res) => {
  try {
    const projectId = req.auth && req.auth.projectId;
    if (!projectId) {
      return res.status(401).json({ error: 'missing project context' });
    }
    const tasks = getTasks(projectId);
    return res.json({ tasks });
  } catch (err) {
    return res.status(500).json({ error: 'failed to fetch tasks' });
  }
});

// POST /api/tasks - create a new task
router.post('/', (req, res) => {
  const { title, status } = req.body || {};

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }

  const projectId = req.auth && req.auth.projectId;
  if (!projectId) {
    return res.status(401).json({ error: 'missing project context' });
  }

  try {
    const task = addTask(projectId, title.trim(), status || 'todo');
    return res.status(201).json({ task });
  } catch (err) {
    return res.status(500).json({ error: 'failed to create task' });
  }
});

// PATCH /api/tasks/:id - update an existing task
router.patch('/:id', (req, res) => {
  const projectId = req.auth && req.auth.projectId;
  if (!projectId) {
    return res.status(401).json({ error: 'missing project context' });
  }

  const existing = getTask(req.params.id);
  if (!existing || existing.project_id !== projectId) {
    return res.status(404).json({ error: 'task not found' });
  }

  const fields = {};
  if (typeof req.body?.title === 'string') fields.title = req.body.title;
  if (typeof req.body?.status === 'string') fields.status = req.body.status;

  try {
    const updated = updateTask(req.params.id, fields);
    return res.json({ task: updated });
  } catch (err) {
    return res.status(500).json({ error: 'failed to update task' });
  }
});

// DELETE /api/tasks/:id - delete a task
router.delete('/:id', (req, res) => {
  const projectId = req.auth && req.auth.projectId;
  if (!projectId) {
    return res.status(401).json({ error: 'missing project context' });
  }

  const existing = getTask(req.params.id);
  if (!existing || existing.project_id !== projectId) {
    return res.status(404).json({ error: 'task not found' });
  }

  try {
    deleteTask(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'failed to delete task' });
  }
});

module.exports = function mountTasks(app) {
  app.use('/api/tasks', router);
};
