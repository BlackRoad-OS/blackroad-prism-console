'use strict';

const express = require('express');
const { addTask, getTask, getTasks, updateTask, deleteTask } = require('../data');

const router = express.Router();

// GET /  - List all tasks for the authenticated user's project
router.get('/', (req, res) => {
  const tasks = getTasks(req.auth.projectId);
  return res.json({ tasks });
});

// GET /:id  - Get a single task by id
router.get('/:id', (req, res) => {
  const task = getTask(req.params.id);
  if (!task || task.project_id !== req.auth.projectId) {
    return res.status(404).json({ error: 'task_not_found' });
  }
  return res.json({ task });
});

// POST /  - Create a new task
router.post('/', (req, res) => {
  const { title, projectId } = req.body || {};
  const targetProject = projectId || req.auth.projectId;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'invalid_task' });
  }

  if (targetProject !== req.auth.projectId) {
    return res.status(403).json({ error: 'forbidden_project' });
  }

  const task = addTask(targetProject, title.trim());
  return res.status(201).json({ task });
});

// PATCH /:id  - Update an existing task
router.patch('/:id', (req, res) => {
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

// DELETE /:id  - Delete a task
router.delete('/:id', (req, res) => {
  const task = getTask(req.params.id);
  if (!task || task.project_id !== req.auth.projectId) {
    return res.status(404).json({ error: 'task_not_found' });
  }

  deleteTask(task.id);
  return res.json({ ok: true });
});

module.exports = router;
