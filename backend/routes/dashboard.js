const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb, query, run, get } = require('../models/db');
const router = express.Router();

router.get('/overview', async (req, res) => {
  await getDb();
  const since = Date.now() - 864e5;
  res.json({
    total_endpoints:  get('SELECT COUNT(*) as n FROM endpoints').n,
    total_tests:      get('SELECT COUNT(*) as n FROM test_results').n,
    tests_today:      get('SELECT COUNT(*) as n FROM test_results WHERE created_at>=?', [since]).n,
    slow_today:       get('SELECT COUNT(*) as n FROM test_results WHERE created_at>=? AND is_slow=1', [since]).n,
    errors_today:     get('SELECT COUNT(*) as n FROM test_results WHERE created_at>=? AND (error IS NOT NULL OR status_code>=500)', [since]).n,
    avg_response_ms:  Math.round(get('SELECT AVG(response_time) as avg FROM test_results WHERE created_at>=? AND response_time IS NOT NULL', [since])?.avg || 0),
    recent_alerts:    query('SELECT a.*, e.name as endpoint_name FROM alerts a LEFT JOIN endpoints e ON a.endpoint_id=e.id ORDER BY a.created_at DESC LIMIT 10'),
    slowest_endpoints: query('SELECT endpoint_id, e.name, e.url, e.method, AVG(response_time) as avg_ms, COUNT(*) as test_count, SUM(is_slow) as slow_count FROM test_results t LEFT JOIN endpoints e ON t.endpoint_id=e.id WHERE t.created_at>=? AND t.endpoint_id IS NOT NULL AND t.response_time IS NOT NULL GROUP BY endpoint_id ORDER BY avg_ms DESC LIMIT 5', [since]),
  });
});

router.get('/alerts', async (req, res) => {
  await getDb();
  const rows = req.query.unread_only === '1'
    ? query('SELECT a.*, e.name as endpoint_name FROM alerts a LEFT JOIN endpoints e ON a.endpoint_id=e.id WHERE a.acknowledged=0 ORDER BY a.created_at DESC LIMIT 100')
    : query('SELECT a.*, e.name as endpoint_name FROM alerts a LEFT JOIN endpoints e ON a.endpoint_id=e.id ORDER BY a.created_at DESC LIMIT 100');
  res.json(rows);
});

router.patch('/alerts/ack-all', async (req, res) => {
  await getDb();
  run('UPDATE alerts SET acknowledged=1');
  res.json({ success: true });
});

router.patch('/alerts/:id/ack', async (req, res) => {
  await getDb();
  run('UPDATE alerts SET acknowledged=1 WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

router.get('/compare', async (req, res) => {
  await getDb();
  const ids = Array.isArray(req.query.ids) ? req.query.ids : [req.query.ids];
  if (!ids.filter(Boolean).length) return res.status(400).json({ error: 'ids[] required' });
  const periodMs = { '1h':36e5, '24h':864e5, '7d':6048e5, '30d':2592e6 }[req.query.period||'24h'] || 864e5;
  const since = Date.now() - periodMs;
  const placeholders = ids.map(()=>'?').join(',');
  res.json(query(
    `SELECT endpoint_id, e.name, e.url, e.method, AVG(response_time) as avg_ms, MIN(response_time) as min_ms, MAX(response_time) as max_ms, COUNT(*) as count, SUM(is_slow) as slow_count, SUM(CASE WHEN error IS NOT NULL OR status_code>=500 THEN 1 ELSE 0 END) as error_count FROM test_results t LEFT JOIN endpoints e ON t.endpoint_id=e.id WHERE t.endpoint_id IN (${placeholders}) AND t.created_at>=? AND t.response_time IS NOT NULL GROUP BY endpoint_id`,
    [...ids, since]
  ));
});

module.exports = router;