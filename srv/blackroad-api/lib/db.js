const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/srv/blackroad-api/blackroad.db';

let db;
try {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const Database = require('better-sqlite3');
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
} catch (_) {
  // Use a no-op stub when the DB is unavailable (e.g. in sandboxed environments)
  const noop = () => {};
  db = {
    pragma: noop,
    exec: noop,
    close: noop,
    prepare() {
      return { run: () => ({ lastInsertRowid: 0, changes: 0 }), get: () => undefined, all: () => [] };
    },
  };
}

module.exports = { db, DB_PATH };
