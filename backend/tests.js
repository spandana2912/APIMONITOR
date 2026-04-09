const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../models/db');
const { executeRequest } = require('../utils/requester');

const router = express.Router();

// Run a one-off test (no saved endpoint required)
router.post('/run', async (req, res) => {
  const { url, method = 'GET', headers = {}, body = '', threshold_ms = 1000, endpoint_id } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  const result = await executeRequest({ url, method, headers, body });
  const is_slow = result.response_time !== null && result.response_time > threshold_ms ? 1 : 0;

  const db = getDb();
  const id = uuid();
  const now = Date.now();

  db.prepare(`
    INSERT INTO test_results
      (id, endpoint_id, url, method, status_code, response_time, response_body,
       request_headers, request_body, response_headers, error, is_slow, threshold_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    endpoint_id || null,
    url,
    method.toUpperCase(),
    result.status_code,
    result.response_time,
    result.response_body,
    JSON.stringify(headers),
    body,
    JSON.stringify(result.response_headers),
    result.error,
    is_slow,
    threshold_ms,
    now
  );

  // Create alert if slow or error
  if (is_slow || result.error || (result.status_code && result.status_code >= 500)) {
    const alertType = result.error ? 'error' : result.status_code >= 500 ? 'down' : 'slow';
    const message = result.error
      ? result.error
      : result.status_code >= 500
      ? `HTTP ${result.status_code}`
      : `Response time ${result.response_time}ms exceeded threshold ${threshold_ms}ms`;

    db.prepare(`
      INSERT INTO alerts (id, endpoint_id, result_id, type, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuid(), endpoint_id || null, id, alertType, message, now);
  }

  const saved = db.prepare('SELECT * FROM test_results WHERE id=?').get(id);
  res.json(parseResult(saved));
});

// Run test for a saved endpoint
router.post('/run/:endpointId', async (req, res) => {
  const db = getDb();
  const ep = db.prepare('SELECT * FROM endpoints WHERE id=?').get(req.params.endpointId);
  if (!ep) return res.status(404).json({ error: 'Endpoint not found' });

  req.body = {
    url: ep.url,
    method: ep.method,
    headers: tryParse(ep.headers, {}),
    body: ep.body,
    threshold_ms: ep.threshold_ms,
    endpoint_id: ep.id,
  };

  // delegate to the generic run handler
  return router.handle({ ...req, url: '/run', path: '/run' }, res, () => {});
});

// Get test history (all or filtered by endpoint)
router.get('/history', (req, res) => {
  const db = getDb();
  const { endpoint_id, limit = 100, offset = 0 } = req.query;

  let rows;
  if (endpoint_id) {
    rows = db.prepare(
      'SELECT * FROM test_results WHERE endpoint_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(endpoint_id, +limit, +offset);
  } else {
    rows = db.prepare(
      'SELECT * FROM test_results ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(+limit, +offset);
  }

  res.json(rows.map(parseResult));
});

// Stats / performance trends for an endpoint
router.get('/stats/:endpointId', (req, res) => {
  const db = getDb();
  const { endpointId } = req.params;
  const { period = '24h' } = req.query;

  const periodMs = { '1h': 36e5, '24h': 864e5, '7d': 6048e5, '30d': 2592e6 }[period] || 864e5;
  const since = Date.now() - periodMs;

  const rows = db.prepare(
    `SELECT * FROM test_results WHERE endpoint_id=? AND created_at>=? ORDER BY created_at ASC`
  ).all(endpointId, since);

  if (!rows.length) return res.json({ count: 0, avg_ms: null, min_ms: null, max_ms: null, p95_ms: null, error_rate: 0, slow_rate: 0, series: [] });

  const times = rows.filter(r => r.response_time != null).map(r => r.response_time).sort((a, b) => a - b);
  const errors = rows.filter(r => r.error || (r.status_code && r.status_code >= 500)).length;
  const slows = rows.filter(r => r.is_slow).length;

  const avg = times.length ? Math.round(times.reduce((s, v) => s + v, 0) / times.length) : null;
  const p95 = times.length ? times[Math.floor(times.length * 0.95)] : null;

  res.json({
    count: rows.length,
    avg_ms: avg,
    min_ms: times[0] ?? null,
    max_ms: times[times.length - 1] ?? null,
    p95_ms: p95,
    error_rate: +(errors / rows.length * 100).toFixed(1),
    slow_rate: +(slows / rows.length * 100).toFixed(1),
    series: rows.map(r => ({
      t: r.created_at,
      ms: r.response_time,
      status: r.status_code,
      error: r.error,
      slow: r.is_slow,
    })),
  });
});

// Delete a single result
router.delete('/:id', (req, res) => {
  getDb().prepare('DELETE FROM test_results WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Clear history for an endpoint
router.delete('/history/:endpointId', (req, res) => {
  getDb().prepare('DELETE FROM test_results WHERE endpoint_id=?').run(req.params.endpointId);
  res.json({ success: true });
});

function parseResult(row) {
  return {
    ...row,
    response_headers: tryParse(row.response_headers, {}),
    request_headers: tryParse(row.request_headers, {}),
    is_slow: !!row.is_slow,
  };
}

function tryParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
