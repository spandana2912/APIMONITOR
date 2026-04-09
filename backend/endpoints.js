const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../models/db');

const router = express.Router();

// List all endpoints
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM endpoints ORDER BY created_at DESC').all();
  res.json(rows.map(parseEndpoint));
});

// Create endpoint
router.post('/', (req, res) => {
  const { name, url, method = 'GET', headers = '{}', body = '', threshold_ms = 1000, tags = '' } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url are required' });

  const db = getDb();
  const now = Date.now();
  const id = uuid();
  db.prepare(`
    INSERT INTO endpoints (id, name, url, method, headers, body, threshold_ms, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, url, method.toUpperCase(), JSON.stringify(headers), body, threshold_ms, tags, now, now);

  res.status(201).json(parseEndpoint(db.prepare('SELECT * FROM endpoints WHERE id=?').get(id)));
});

// Get single endpoint
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM endpoints WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseEndpoint(row));
});

// Update endpoint
router.put('/:id', (req, res) => {
  const { name, url, method, headers, body, threshold_ms, tags } = req.body;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM endpoints WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare(`
    UPDATE endpoints SET name=?, url=?, method=?, headers=?, body=?, threshold_ms=?, tags=?, updated_at=?
    WHERE id=?
  `).run(
    name ?? existing.name,
    url ?? existing.url,
    (method ?? existing.method).toUpperCase(),
    headers != null ? JSON.stringify(headers) : existing.headers,
    body ?? existing.body,
    threshold_ms ?? existing.threshold_ms,
    tags ?? existing.tags,
    Date.now(),
    req.params.id
  );

  res.json(parseEndpoint(db.prepare('SELECT * FROM endpoints WHERE id=?').get(req.params.id)));
});

// Delete endpoint
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM endpoints WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

function parseEndpoint(row) {
  return {
    ...row,
    headers: tryParse(row.headers, {}),
  };
}

function tryParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
