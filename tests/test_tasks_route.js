const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.NODE_ENV = 'test';
process.env.USE_SQLITE_MOCK = '1';

const tasksRouter = require('../backend/routes/tasks');

function makeApp(projectId) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { userId: 'u1', projectId };
    next();
  });
  app.use('/tasks', tasksRouter);
  return app;
}

function listen(app) {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/tasks`;
  return { server, base };
}

test('POST /tasks rejects empty title', async () => {
  const app = makeApp('proj-1');
  const { server, base } = listen(app);
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'invalid_task');
  } finally {
    server.close();
  }
});

test('POST /tasks rejects missing title', async () => {
  const app = makeApp('proj-1');
  const { server, base } = listen(app);
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'invalid_task');
  } finally {
    server.close();
  }
});

test('POST /tasks rejects wrong projectId', async () => {
  const app = makeApp('proj-1');
  const { server, base } = listen(app);
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test task', projectId: 'proj-other' }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'forbidden_project');
  } finally {
    server.close();
  }
});

test('GET /tasks returns a list', async () => {
  const app = makeApp('proj-1');
  const { server, base } = listen(app);
  try {
    const res = await fetch(base);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.tasks));
  } finally {
    server.close();
  }
});

test('GET /tasks/:id returns 404 for non-existent task', async () => {
  const app = makeApp('proj-1');
  const { server, base } = listen(app);
  try {
    const res = await fetch(`${base}/no-such-id`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'task_not_found');
  } finally {
    server.close();
  }
});

test('PATCH /tasks/:id returns 404 for non-existent task', async () => {
  const app = makeApp('proj-1');
  const { server, base } = listen(app);
  try {
    const res = await fetch(`${base}/no-such-id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'task_not_found');
  } finally {
    server.close();
  }
});

test('DELETE /tasks/:id returns 404 for non-existent task', async () => {
  const app = makeApp('proj-1');
  const { server, base } = listen(app);
  try {
    const res = await fetch(`${base}/no-such-id`, {
      method: 'DELETE',
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'task_not_found');
  } finally {
    server.close();
  }
});
