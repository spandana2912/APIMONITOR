const express = require('express');
const { getDb } = require('../models/db');

const router = express.Router();

// Overview dashboard stats
router.get('/overview', (req, res) => {
  const db = getDb();
  const since24h = Date.now() - 864e5;

  const totalEndpoints = db.prepare('SELECT COUNT(*) as n FROM endpoints').get().n;
  const totalTests = db.prepare('SELECT COUNT(*) as n FROM test_results').get().n;
  const testsToday = db.prepare('SELECT COUNT(*) as n FROM test_results WHERE created_at>=?').get(since24h).n;
  const slowToday = db.prepare('SELECT COUNT(*) as n FROM test_results WHERE created_at>=? AND is_slow=1').get(since24h).n;
  const errorsToday = db.prepare(`
    SELECT COUNT(*) as n FROM test_results
    WHERE created_at>=? AND (error IS NOT NULL OR (status_code>=500 AND status_code IS NOT NULL))
  `).get(since24h).n;

  const avgTime = db.prepare(
    'SELECT AVG(response_time) as avg FROM test_results WHERE created_at>=? AND response_time IS NOT NULL'
  ).get(since24h).avg;

  const recentAlerts = db.prepare(`
    SELECT a.*, e.name as endpoint_name FROM alerts a
    LEFT JOIN endpoints e ON a.endpoint_id=e.id
    ORDER BY a.created_at DESC LIMIT 10
  `).all();

  // Top slowest endpoints (last 24h avg)
  const slowest = db.prepare(`
    SELECT endpoint_id, e.name, e.url, e.method,
           AVG(response_time) as avg_ms,
           COUNT(*) as test_count,
           SUM(is_slow) as slow_count
    FROM test_results t
    LEFT JOIN endpoints e ON t.endpoint_id=e.id
    WHERE t.created_at>=? AND t.endpoint_id IS NOT NULL AND t.response_time IS NOT NULL
    GROUP BY endpoint_id
    ORDER BY avg_ms DESC
    LIMIT 5
  `).all(since24h);

  res.json({
    total_endpoints: totalEndpoints,
    total_tests: totalTests,
    tests_today: testsToday,
    slow_today: slowToday,
    errors_today: errorsToday,
    avg_response_ms: avgTime ? Math.round(avgTime) : null,
    recent_alerts: recentAlerts,
    slowest_endpoints: slowest,
  });
});

// Alerts list
router.get('/alerts', (req, res) => {
  const db = getDb();
  const { unread_only } = req.query;
  let q = `
    SELECT a.*, e.name as endpoint_name FROM alerts a
    LEFT JOIN endpoints e ON a.endpoint_id=e.id
  `;
  if (unread_only === '1') q += ' WHERE a.acknowledged=0';
  q += ' ORDER BY a.created_at DESC LIMIT 100';
  res.json(db.prepare(q).all());
});

// Acknowledge alert
router.patch('/alerts/:id/ack', (req, res) => {
  getDb().prepare('UPDATE alerts SET acknowledged=1 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Acknowledge all
router.patch('/alerts/ack-all', (req, res) => {
  getDb().prepare('UPDATE alerts SET acknowledged=1').run();
  res.json({ success: true });
});

// Compare multiple endpoints
router.get('/compare', (req, res) => {
  const db = getDb();
  const { ids, period = '24h' } = req.query;
  const idList = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (!idList.length) return res.status(400).json({ error: 'ids[] required' });

  const periodMs = { '1h': 36e5, '24h': 864e5, '7d': 6048e5, '30d': 2592e6 }[period] || 864e5;
  const since = Date.now() - periodMs;

  const placeholders = idList.map(() => '?').join(',');
  const results = db.prepare(`
    SELECT endpoint_id, e.name, e.url, e.method,
           AVG(response_time) as avg_ms,
           MIN(response_time) as min_ms,
           MAX(response_time) as max_ms,
           COUNT(*) as count,
           SUM(is_slow) as slow_count,
           SUM(CASE WHEN error IS NOT NULL OR status_code>=500 THEN 1 ELSE 0 END) as error_count
    FROM test_results t
    LEFT JOIN endpoints e ON t.endpoint_id=e.id
    WHERE t.endpoint_id IN (${placeholders}) AND t.created_at>=? AND t.response_time IS NOT NULL
    GROUP BY endpoint_id
  `).all(...idList, since);

  res.json(results);
});

module.exports = router;
