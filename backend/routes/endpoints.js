const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb, query, run, get } = require('../models/db');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await getDb();
    res.json((await query('SELECT * FROM endpoints ORDER BY created_at DESC')).map(parseEndpoint));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, url, method='GET', headers='{}', body='', threshold_ms=1000, tags='' } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name and url are required' });
    await getDb();
    const now = Date.now(), id = uuid();
    await run('INSERT INTO endpoints (id,name,url,method,headers,body,threshold_ms,tags,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, name, url, method.toUpperCase(), JSON.stringify(headers), body, threshold_ms, tags, now, now]);
    res.status(201).json(parseEndpoint(await get('SELECT * FROM endpoints WHERE id=?', [id])));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    await getDb();
    const row = await get('SELECT * FROM endpoints WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(parseEndpoint(row));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    await getDb();
    const existing = await get('SELECT * FROM endpoints WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { name, url, method, headers, body, threshold_ms, tags } = req.body;
    await run('UPDATE endpoints SET name=?,url=?,method=?,headers=?,body=?,threshold_ms=?,tags=?,updated_at=? WHERE id=?',
      [name??existing.name, url??existing.url, (method??existing.method).toUpperCase(),
       headers!=null?JSON.stringify(headers):existing.headers, body??existing.body,
       threshold_ms??existing.threshold_ms, tags??existing.tags, Date.now(), req.params.id]);
    res.json(parseEndpoint(await get('SELECT * FROM endpoints WHERE id=?', [req.params.id])));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await getDb();
    await run('DELETE FROM endpoints WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

function parseEndpoint(row) {
  if (!row) return null;
  try { row.headers = JSON.parse(row.headers); } catch { row.headers = {}; }
  return row;
}

module.exports = router;