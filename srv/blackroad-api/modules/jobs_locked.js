'use strict';

// Jobs locked module — sandboxed, precise progress, SSE logs.
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const SHOULD_DISABLE_DB = /^(1|true)$/i.test(
  process.env.BR_TEST_DISABLE_DB || process.env.BRC_DISABLE_NATIVE_DB || ''
);

let NativeDb;
try { NativeDb = require('better-sqlite3'); } catch (_) { NativeDb = null; }

class MockDb {
  prepare() { return { run: () => ({}), get: () => undefined, all: () => [] }; }
  pragma() {}
  exec() {}
}

function db() {
  if (SHOULD_DISABLE_DB || !NativeDb) return new MockDb();
  try {
    const dbPath = process.env.DB_PATH || ':memory:';
    if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const instance = new NativeDb(dbPath);
    instance.pragma('journal_mode = WAL');
    return instance;
  } catch (_) { return new MockDb(); }
}

function now() { return new Date().toISOString(); }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function parseProgressLine(line) {
  const m = line.match(/\[\[PROGRESS\s+([\d.]+)%?\]\]/);
  if (m) { const n = parseFloat(m[1]); return clamp01(n > 1 ? n / 100 : n); }
  try { const obj = JSON.parse(line); if (obj && typeof obj.progress === 'number') return clamp01(obj.progress); } catch (_) {}
  return null;
}

function parseStageLine(line) {
  const m = line.match(/\[\[STAGE name=(\S+)\s+(start|done|error)\]\]/);
  if (!m) return null;
  return { name: m[1], done: m[2] === 'done', error: m[2] === 'error' };
}

async function led(_event) {}

const PROCS = new Map();

function wireChild(job_id, child, onClose) {
  return new Promise((resolve) => {
    let lastPct = 0;
    const handler = async (buf) => {
      const s = buf.toString();
      await appendEvent(job_id, 'log', s);
      for (const line of s.split(/\r?\n/)) {
        const p = parseProgressLine(line);
        if (p != null && Math.abs(p - lastPct) >= 0.01) {
          lastPct = clamp01(p);
          await updateJob(job_id, { progress: lastPct });
          await led({ type: 'led.progress', pct: Math.round(lastPct * 100), ttl_s: 90 });
        }
        const st = parseStageLine(line);
        if (st && st.name) {
          await appendEvent(job_id, 'stage', {
            name: st.name,
            status: st.error ? 'error' : st.done ? 'done' : 'start',
          });
        }
      }
    };
    if (child.stdout) child.stdout.on('data', handler);
    if (child.stderr) child.stderr.on('data', handler);
    child.on('close', async (code) => {
      PROCS.delete(job_id);
      try {
        await onClose(code, lastPct);
      } catch (err) {
        console.error('[jobs_locked] onClose error', err);
      } finally {
        resolve();
      }
    });
  });
}

const _db = db();
const clients = new Map();

async function appendEvent(job_id, type, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  const set = clients.get(job_id);
  if (!set) return;
  const line = 'event: ' + type + '\ndata: ' + payload + '\n\n';
  for (const res of set) { try { res.write(line); } catch (_) {} }
}

async function updateJob(job_id, patch) {
  if (patch.progress != null) await appendEvent(job_id, 'progress', { progress: patch.progress });
  if (patch.status) await appendEvent(job_id, 'state', { status: patch.status });
}

const PROJECTS_DIR = process.env.PROJECTS_DIR || '/srv/projects';

async function startJob(body) {
  const { project = 'default', kind = 'custom', cmd = '', args = [], env = {} } = body;
  const id = uuidv4();
  await appendEvent(id, 'state', { status: 'running', project, kind });
  await led({ type: 'led.progress', pct: 5, ttl_s: 180 });
  const cwd = path.join(PROJECTS_DIR, project);
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env } });
  PROCS.set(id, { child });
  wireChild(id, child, async (code) => {
    await updateJob(id, { status: code === 0 ? 'success' : 'error', exit_code: code });
    await led({ type: 'led.emotion', emotion: code === 0 ? 'success' : 'error', ttl_s: 20 });
  }).catch((e) => console.error('[jobs_locked] start error', e));
  return id;
}

module.exports = function attachJobs({ app }) {
  app.post('/api/jobs/start', async (req, res) => {
    try { const id = await startJob(req.body || {}); res.json({ ok: true, job_id: id }); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/jobs/:id', async (req, res) => {
    const row = _db.prepare('SELECT * FROM jobs WHERE job_id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json(row);
  });

  app.get('/api/jobs', async (req, res) => {
    const pr = req.query.project;
    const rows = pr
      ? _db.prepare('SELECT * FROM jobs WHERE project_id=? ORDER BY started_at DESC LIMIT 50').all(pr)
      : _db.prepare('SELECT * FROM jobs ORDER BY started_at DESC LIMIT 50').all();
    res.json(rows);
  });

  app.post('/api/jobs/:id/cancel', async (req, res) => {
    const id = String(req.params.id);
    const p = PROCS.get(id);
    if (p && p.child) {
      try { p.child.kill('SIGTERM'); } catch (_) {}
      PROCS.delete(id);
    }
    res.json({ ok: true });
  });

  app.get('/api/jobs/:id/events', (req, res) => {
    const id = String(req.params.id);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    if (!clients.has(id)) clients.set(id, new Set());
    clients.get(id).add(res);
    req.on('close', () => {
      const set = clients.get(id);
      if (set) { set.delete(res); if (!set.size) clients.delete(id); }
    });
  });
};
