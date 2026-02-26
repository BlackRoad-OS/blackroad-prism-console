const MockDatabase = require('./mocks/better-sqlite3');

describe('MockDatabase', () => {
  let db;

  beforeEach(() => {
    db = new MockDatabase();
  });

  describe('table management', () => {
    it('creates tables via exec without error', () => {
      expect(() =>
        db.exec('CREATE TABLE IF NOT EXISTS users (id, name)')
      ).not.toThrow();
    });

    it('pragma is a no-op', () => {
      expect(() => db.pragma('journal_mode = WAL')).not.toThrow();
    });

    it('close is a no-op', () => {
      expect(() => db.close()).not.toThrow();
    });
  });

  describe('INSERT', () => {
    it('inserts a row and returns changes', () => {
      const stmt = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
      const result = stmt.run(['Alice', 'alice@example.com']);
      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(1);
    });

    it('auto-increments the id', () => {
      const stmt = db.prepare('INSERT INTO users (name) VALUES (?)');
      const first = stmt.run(['Alice']);
      const second = stmt.run(['Bob']);
      expect(first.lastInsertRowid).toBe(1);
      expect(second.lastInsertRowid).toBe(2);
    });
  });

  describe('SELECT', () => {
    it('returns all inserted rows for known query patterns', () => {
      const insert = db.prepare(
        'INSERT INTO plans (name, monthly_price_cents, is_active) VALUES (?, ?, ?)'
      );
      insert.run(['Free', 0, 1]);
      insert.run(['Pro', 999, 1]);
      insert.run(['Legacy', 500, 0]);

      const count = db.prepare('SELECT COUNT(*) AS c FROM plans').all();
      expect(count).toEqual([{ c: 3 }]);
    });

    it('get returns the first row', () => {
      const insert = db.prepare(
        'INSERT INTO plans (name, monthly_price_cents, is_active) VALUES (?, ?, ?)'
      );
      insert.run(['Free', 0, 1]);
      insert.run(['Pro', 999, 1]);

      const row = db.prepare('SELECT COUNT(*) AS c FROM plans').get();
      expect(row).toEqual({ c: 2 });
    });

    it('get returns undefined when no rows', () => {
      const row = db.prepare('SELECT summary FROM quantum_ai').get();
      expect(row).toBeUndefined();
    });
  });

  describe('DELETE', () => {
    it('deletes a row by id', () => {
      const insert = db.prepare('INSERT INTO items (name) VALUES (?)');
      insert.run(['Widget']);
      insert.run(['Gadget']);

      const del = db.prepare('DELETE FROM items WHERE id = ?');
      const result = del.run([1]);
      expect(result.changes).toBe(1);
    });

    it('returns zero changes when row does not exist', () => {
      db._ensure('items');
      const del = db.prepare('DELETE FROM items WHERE id = ?');
      const result = del.run([999]);
      expect(result.changes).toBe(0);
    });
  });

  describe('CREATE TABLE via _run', () => {
    it('handles CREATE TABLE IF NOT EXISTS', () => {
      const stmt = db.prepare('CREATE TABLE IF NOT EXISTS logs (id, msg)');
      const result = stmt.run();
      expect(result.changes).toBe(0);
    });
  });

  describe('PRAGMA via _run', () => {
    it('handles PRAGMA statements', () => {
      const stmt = db.prepare('PRAGMA journal_mode = WAL');
      const result = stmt.run();
      expect(result.changes).toBe(0);
    });
  });
});
