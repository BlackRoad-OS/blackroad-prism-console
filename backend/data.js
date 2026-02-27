'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { randomUUID } = require('crypto');

const shouldMockSqlite =
  process.env.NODE_ENV === 'test' ||
  String(process.env.USE_SQLITE_MOCK || '').toLowerCase() === 'true' ||
  process.env.USE_SQLITE_MOCK === '1';

let Database;
if (!shouldMockSqlite) {
  try {
    Database = require('better-sqlite3');
  } catch (err) {
    if (!shouldMockSqlite) {
      throw err;
    }
  }
}

if (!Database) {
  Database = require('../tests/mocks/better-sqlite3.js');
}
const migrate = require('./migrate');

const DB_FILE =
  process.env.NODE_ENV === 'test'
    ? '/tmp/blackroad_test.db'
    : process.env.BLACKROAD_DB_PATH || '/srv/blackroad-api/data/blackroad.db';

// Ensure database and schema are ready
migrate();

// Simple connection pool (single connection reused)
const pool = [];
function getDb() {
  if (pool.length === 0) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const db = new Database(DB_FILE);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    pool.push(db);
  }
  return pool[0];
}

function closeDb() {
  if (pool[0]) {
    pool[0].close();
    pool.length = 0;
  }
}

function nowISO() {
  return new Date().toISOString();
}

function isoAfterMinutes(minutes) {
  const mins = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  return new Date(Date.now() + mins * 60 * 1000).toISOString();
}

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  if (Number.isFinite(n)) return n;
  return fallback;
}

function clampInt(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// ---- Ephemeral in-memory store (backward compat) ----
const store = {
  timeline: [],
  lucidiaHistory: [],
  claudeHistory: [],
  codexRuns: [],
  auditLogs: [],
};

function addTimeline(evt) {
  const item = { id: randomUUID(), time: new Date().toISOString(), ...evt };
  store.timeline.unshift(item);
  return item;
}

// ---- Users ----
function addUser(email, passwordHash) {
  const id = uuidv4();
  getDb()
    .prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
    .run(id, email, passwordHash);
  return id;
}

function getUsers() {
  return getDb().prepare('SELECT id, email, password_hash, created_at FROM users').all();
}

// ---- Projects ----
function addProject(userId, name) {
  const id = uuidv4();
  getDb()
    .prepare('INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)')
    .run(id, userId, name);
  return getProject(id);
}

function getProject(id) {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

function getProjects(userId) {
  return getDb().prepare('SELECT * FROM projects WHERE user_id = ?').all(userId);
}

// ---- Tasks ----
function addTask(projectId, title, status = 'todo') {
  const id = uuidv4();
  getDb()
    .prepare('INSERT INTO tasks (id, project_id, title, status) VALUES (?, ?, ?, ?)')
    .run(id, projectId, title, status);
  return getTask(id);
}

function getTask(id) {
  return getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

function getTasks(projectId) {
  return getDb()
    .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId);
}

function getAllTasks() {
  return getDb().prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
}

function updateTask(id, fields) {
  const { title, status } = fields || {};
  getDb()
    .prepare(
      `UPDATE tasks SET title = COALESCE(?, title), status = COALESCE(?, status), updated_at = datetime('now') WHERE id = ?`
    )
    .run(title || null, status || null, id);
  return getTask(id);
}

function deleteTask(id) {
  getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

// ---- Logs ----
function addLog(service, message) {
  getDb().prepare('INSERT INTO logs (service, message) VALUES (?, ?)').run(service, message);
}

function getLogs() {
  return getDb().prepare('SELECT * FROM logs ORDER BY timestamp DESC').all();
}

// ---- Contradictions ----
function addContradiction(module, description) {
  getDb()
    .prepare('INSERT INTO contradictions (module, description) VALUES (?, ?)')
    .run(module, description);
}

function getContradictions() {
  return getDb()
    .prepare('SELECT * FROM contradictions ORDER BY timestamp DESC')
    .all();
}

function deleteContradiction(id) {
  return getDb().prepare('DELETE FROM contradictions WHERE id = ?').run(id);
}

// ---- Exceptions ----
function mapException(row) {
  if (!row) return null;
  return {
    id: row.id,
    rule_id: row.rule_id,
    org_id: row.org_id,
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    requested_by: row.requested_by,
    reason: row.reason,
    status: row.status,
    valid_from: row.valid_from,
    valid_until: row.valid_until,
    ticket_system: row.ticket_system || null,
    ticket_key: row.ticket_key || null,
    ticket_url: row.ticket_url || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function recordExceptionEvent(exceptionId, actor, action, note, at) {
  const db = getDb();
  db.prepare(
    'INSERT INTO exception_events (exception_id, at, actor, action, note) VALUES (?, ?, ?, ?, ?)',
  ).run(exceptionId, at || nowISO(), actor, action, note || null);
}

function createException(entry) {
  const {
    ruleId,
    orgId,
    subjectType,
    subjectId,
    requestedBy,
    reason,
    validFrom = null,
    validUntil = null,
  } = entry;
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO exceptions (rule_id, org_id, subject_type, subject_id, requested_by, reason, status, valid_from, valid_until)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    .run(ruleId, orgId, subjectType, subjectId, requestedBy, reason, validFrom, validUntil);
  const id = info.lastInsertRowid;
  recordExceptionEvent(id, requestedBy, 'request', reason);
  return getException(id);
}

function getException(id) {
  const row = getDb().prepare('SELECT * FROM exceptions WHERE id = ?').get(id);
  return mapException(row);
}

function listExceptions(filters = {}) {
  const clauses = [];
  const params = [];
  if (filters.ruleId) {
    clauses.push('rule_id = ?');
    params.push(filters.ruleId);
  }
  if (filters.subjectType) {
    clauses.push('subject_type = ?');
    params.push(filters.subjectType);
  }
  if (filters.subjectId) {
    clauses.push('subject_id = ?');
    params.push(filters.subjectId);
  }
  if (filters.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const rows = getDb()
    .prepare(`SELECT * FROM exceptions${where} ORDER BY created_at DESC`)
    .all(...params);
  return rows.map(mapException).filter(Boolean);
}

function listActiveExceptions(options = {}) {
  const db = getDb();
  const page = clampInt(toInt(options.page, 1), 1, 10000);
  const pageSize = clampInt(toInt(options.pageSize, 10), 1, 50);
  const nowIso = new Date().toISOString();

  const conditions = [
    "status = 'approved'",
    '(valid_from IS NULL OR datetime(valid_from) <= datetime(?))',
    '(valid_until IS NULL OR datetime(valid_until) >= datetime(?))',
  ];
  const params = [nowIso, nowIso];
  if (options.ruleId) {
    conditions.push('rule_id = ?');
    params.push(options.ruleId);
  }
  if (options.orgId) {
    conditions.push('org_id = ?');
    params.push(options.orgId);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;

  const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM exceptions ${where}`).get(...params);
  const total = totalRow ? Number(totalRow.count || 0) : 0;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

  let currentPage = page;
  if (totalPages > 0 && currentPage > totalPages) {
    currentPage = totalPages;
  }
  const offset = (currentPage - 1) * pageSize;
  const rows = db
    .prepare(
      `SELECT * FROM exceptions ${where} ORDER BY datetime(valid_until) ASC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, Math.max(0, offset));

  return {
    exceptions: rows.map(mapException).filter(Boolean),
    page: currentPage,
    totalPages,
    total,
    pageSize,
  };
}

function approveException(id, options) {
  const exception = getException(id);
  if (!exception) return null;
  const actor = options.actor;
  const note = options.note || null;
  const validFrom = options.valid_from || options.validFrom || new Date().toISOString();
  const validUntil = options.valid_until || options.validUntil || null;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE exceptions
       SET status='approved', valid_from = ?, valid_until = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(validFrom, validUntil, now, id);
  recordExceptionEvent(id, actor, 'approve', note, now);
  return getException(id);
}

function denyException(id, options) {
  const exception = getException(id);
  if (!exception) return null;
  const actor = options.actor;
  const note = options.note || null;
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE exceptions SET status='denied', updated_at = ? WHERE id = ?`)
    .run(now, id);
  recordExceptionEvent(id, actor, 'deny', note, now);
  return getException(id);
}

function revokeException(id, options) {
  const exception = getException(id);
  if (!exception) return null;
  const actor = options.actor;
  const note = options.note || null;
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE exceptions SET status='revoked', updated_at = ? WHERE id = ?`)
    .run(now, id);
  recordExceptionEvent(id, actor, 'revoke', note, now);
  return getException(id);
}

function expireApprovedExceptions(now = new Date()) {
  const db = getDb();
  const cutoff = new Date(now).toISOString();
  const ids = db
    .prepare(
      `SELECT id FROM exceptions
       WHERE status='approved' AND valid_until IS NOT NULL AND datetime(valid_until) < datetime(?)`
    )
    .all(cutoff)
    .map((row) => row.id);
  if (!ids.length) return 0;
  const update = db.prepare(`UPDATE exceptions SET status='expired', updated_at = ? WHERE id = ?`);
  const insert = db.prepare(
    `INSERT INTO exception_events (exception_id, at, actor, action, note) VALUES (?, ?, ?, 'expire', NULL)`
  );
  const tx = db.transaction((exceptionId) => {
    update.run(cutoff, exceptionId);
    insert.run(exceptionId, cutoff, 0);
  });
  ids.forEach((id) => tx(id));
  return ids.length;
}

// ---- Exception Tickets ----
const PENDING_TICKET_KEY = '__pending_ticket__';

function setExceptionTicket(exceptionId, system, key, url) {
  const db = getDb();
  const now = nowISO();
  db.prepare(
    `UPDATE exceptions
     SET ticket_system = ?, ticket_key = ?, ticket_url = ?, updated_at = ?
     WHERE id = ?`,
  ).run(system || null, key || null, url || null, now, exceptionId);
  return getException(exceptionId);
}

function claimExceptionTicket(exceptionId, system = null) {
  const db = getDb();
  const select = db.prepare('SELECT * FROM exceptions WHERE id = ?');
  const update = db.prepare(
    `UPDATE exceptions
     SET ticket_system = ?, ticket_key = ?, ticket_url = NULL, updated_at = ?
     WHERE id = ? AND ticket_key IS NULL`,
  );

  const tx = db.transaction((id) => {
    const current = select.get(id);
    if (!current) {
      return { exception: null, status: 'not_found' };
    }

    if (current.ticket_key && current.ticket_key !== PENDING_TICKET_KEY) {
      return { exception: current, status: 'has_ticket' };
    }

    if (current.ticket_key === PENDING_TICKET_KEY) {
      return { exception: current, status: 'pending' };
    }

    const now = nowISO();
    const result = update.run(system || null, PENDING_TICKET_KEY, now, id);
    if (result.changes === 0) {
      const refreshed = select.get(id);
      if (!refreshed) {
        return { exception: null, status: 'not_found' };
      }
      if (refreshed.ticket_key === PENDING_TICKET_KEY) {
        return { exception: refreshed, status: 'pending' };
      }
      if (refreshed.ticket_key) {
        return { exception: refreshed, status: 'has_ticket' };
      }
      return { exception: refreshed, status: 'unavailable' };
    }

    const claimed = select.get(id);
    return { exception: claimed, status: 'claimed' };
  });

  return tx(exceptionId);
}

function releasePendingTicket(exceptionId) {
  const db = getDb();
  const now = nowISO();
  const result = db
    .prepare(
      `UPDATE exceptions
       SET ticket_system = NULL, ticket_key = NULL, ticket_url = NULL, updated_at = ?
       WHERE id = ? AND ticket_key = ?`,
    )
    .run(now, exceptionId, PENDING_TICKET_KEY);
  return result.changes > 0;
}

function getTicketQueueEntry(exceptionId) {
  return getDb().prepare('SELECT * FROM ticket_queue WHERE exception_id = ?').get(exceptionId);
}

function upsertTicketQueue(exceptionId, attempts, lastError, delayMinutes = 10) {
  const db = getDb();
  const now = nowISO();
  const nextTry = isoAfterMinutes(delayMinutes);
  db.prepare(
    `INSERT INTO ticket_queue (exception_id, attempts, last_error, next_try, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(exception_id) DO UPDATE SET
       attempts = excluded.attempts,
       last_error = excluded.last_error,
       next_try = excluded.next_try,
       updated_at = excluded.updated_at`,
  ).run(exceptionId, attempts, lastError || null, nextTry, now, now);
  return getTicketQueueEntry(exceptionId);
}

function getDueTicketQueue(limit = 20) {
  return getDb()
    .prepare(
      `SELECT * FROM ticket_queue
       WHERE datetime(next_try) <= datetime('now')
       ORDER BY datetime(next_try) ASC
       LIMIT ?`,
    )
    .all(limit);
}

function updateTicketQueue(id, attempts, lastError, delayMinutes = 10) {
  const db = getDb();
  const now = nowISO();
  const nextTry = isoAfterMinutes(delayMinutes);
  db.prepare(
    `UPDATE ticket_queue
     SET attempts = ?, last_error = ?, next_try = ?, updated_at = ?
     WHERE id = ?`,
  ).run(attempts, lastError || null, nextTry, now, id);
}

function deleteTicketQueue(id) {
  getDb().prepare('DELETE FROM ticket_queue WHERE id = ?').run(id);
}

function deleteTicketQueueByException(exceptionId) {
  getDb().prepare('DELETE FROM ticket_queue WHERE exception_id = ?').run(exceptionId);
}

module.exports = {
  store,
  getDb,
  closeDb,
  addUser,
  getUsers,
  addProject,
  getProject,
  getProjects,
  addTask,
  getTask,
  getTasks,
  getAllTasks,
  updateTask,
  deleteTask,
  addLog,
  getLogs,
  addContradiction,
  getContradictions,
  deleteContradiction,
  addTimeline,
  createException,
  getException,
  listExceptions,
  listActiveExceptions,
  approveException,
  denyException,
  revokeException,
  expireApprovedExceptions,
  recordExceptionEvent,
  setExceptionTicket,
  getTicketQueueEntry,
  upsertTicketQueue,
  getDueTicketQueue,
  updateTicketQueue,
  deleteTicketQueue,
  deleteTicketQueueByException,
  claimExceptionTicket,
  releasePendingTicket,
  PENDING_TICKET_KEY,
};
