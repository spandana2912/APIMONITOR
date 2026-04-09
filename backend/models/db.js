const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

async function getDb() {
  if (pool) return pool;
  pool = mysql.createPool({
    host:     process.env.DB_HOST || 'localhost',
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'api_monitor',
    waitForConnections: true,
    connectionLimit: 10,
  });
  await initSchema();
  return pool;
}

async function initSchema() {
  await pool.execute(`CREATE TABLE IF NOT EXISTS endpoints (
    id VARCHAR(36) PRIMARY KEY, name VARCHAR(255) NOT NULL, url TEXT NOT NULL,
    method VARCHAR(10) NOT NULL DEFAULT 'GET', headers TEXT DEFAULT '{}',
    body TEXT DEFAULT '', threshold_ms INT DEFAULT 1000,
    tags VARCHAR(255) DEFAULT '', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS test_results (
    id VARCHAR(36) PRIMARY KEY, endpoint_id VARCHAR(36), url TEXT NOT NULL,
    method VARCHAR(10) NOT NULL, status_code INT, response_time INT,
    response_body LONGTEXT, request_headers TEXT DEFAULT '{}',
    request_body TEXT DEFAULT '', response_headers TEXT DEFAULT '{}',
    error TEXT, is_slow TINYINT DEFAULT 0, threshold_ms INT DEFAULT 1000,
    created_at BIGINT NOT NULL
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS alerts (
    id VARCHAR(36) PRIMARY KEY, endpoint_id VARCHAR(36), result_id VARCHAR(36),
    type VARCHAR(20) NOT NULL, message TEXT, acknowledged TINYINT DEFAULT 0,
    created_at BIGINT NOT NULL
  )`);
}

async function query(sql, params = []) {
  const db = await getDb();
  const [rows] = await db.execute(sql, params);
  return rows;
}

async function run(sql, params = []) {
  const db = await getDb();
  await db.execute(sql, params);
}

async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

module.exports = { getDb, query, run, get };