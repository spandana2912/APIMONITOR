const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'monitor.db');
let db;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  initSchema();
  persist();
  return db;
}

function persist() {
  // Save to disk every 5 seconds
  setInterval(() => {
    if (!db) return;
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }, 5000);
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS endpoints (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'GET', headers TEXT DEFAULT '{}',
      body TEXT DEFAULT '', threshold_ms INTEGER DEFAULT 1000,
      tags TEXT DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS test_results (
      id TEXT PRIMARY KEY, endpoint_id TEXT, url TEXT NOT NULL, method TEXT NOT NULL,
      status_code INTEGER, response_time INTEGER, response_body TEXT,
      request_headers TEXT DEFAULT '{}', request_body TEXT DEFAULT '',
      response_headers TEXT DEFAULT '{}', error TEXT,
      is_slow INTEGER DEFAULT 0, threshold_ms INTEGER DEFAULT 1000,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY, endpoint_id TEXT, result_id TEXT,
      type TEXT NOT NULL, message TEXT, acknowledged INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_results_endpoint ON test_results(endpoint_id);
    CREATE INDEX IF NOT EXISTS idx_results_created  ON test_results(created_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_endpoint  ON alerts(endpoint_id);
  `);
}

// sql.js uses synchronous exec but needs async wrapper for compatibility
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  db.run(sql, params);
}

function get(sql, params = []) {
  return query(sql, params)[0] || null;
}

module.exports = { getDb, query, run, get };