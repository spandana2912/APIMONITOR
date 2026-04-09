const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb, query, run, get } = require('../models/db');
const { executeRequest } = require('../utils/requester');
const router = express.Router();

router.post('/run', async (req, res) => {
  try {
    const { url, method='GET', headers={}, body='', threshold_ms=1000, endpoint_id } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });
    await getDb();
    const result = await executeRequest({ url, method, headers, body });
    const is_slow = result.response_time > threshold_ms ? 1 : 0;
    const id = uuid(), now = Date.now();
    await run('INSERT INTO test_results (id,endpoint_id,url,method,status_code,response_time,response_body,request_headers,request_body,response_headers,error,is_slow,threshold_ms,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id, endpoint_id||null, url, method.toUpperCase(), result.status_code, result.response_time,
       result.response_body, JSON.stringify(headers), body, JSON.stringify(result.response_headers),
       result.error, is_slow, threshold_ms, now]);
    if (is_slow || result.error || (result.status_code >= 500)) {
      const type = result.error ? 'error' : result.status_code >= 500 ? 'down' : 'slow';
      const message = result.error || (result.status_code >= 500 ? `HTTP ${result.status_code}` : `${result.response_time}ms exceeded ${threshold_ms}ms`);
      await run('INSERT INTO alerts (id,endpoint_id,result_id,type,message,created_at) VALUES (?,?,?,?,?,?)',
        [uuid(), endpoint_id||null, id, type, message, now]);
    }
    const saved = await get('SELECT * FROM test_results WHERE id=?', [id]);
    res.json(parseResult(saved));
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/run/:endpointId', async (req, res) => {
  try {
    await getDb();
    const ep = await get('SELECT * FROM endpoints WHERE id=?', [req.params.endpointId]);
    if (!ep) return res.status(404).json({ error: 'Endpoint not found' });
    const result = await executeRequest({ url: ep.url, method: ep.method, headers: JSON.parse(ep.headers||'{}'), body: ep.body });
    const is_slow = result.response_time > ep.threshold_ms ? 1 : 0;
    const id = uuid(), now = Date.now();
    await run('INSERT INTO test_results (id,endpoint_id,url,method,status_code,response_time,response_body,request_headers,request_body,response_headers,error,is_slow,threshold_ms,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id, ep.id, ep.url, ep.method, result.status_code, result.response_time, result.response_body,
       ep.headers, ep.body, JSON.stringify(result.response_headers), result.error, is_slow, ep.threshold_ms, now]);
    res.json(parseResult(await get('SELECT * FROM test_results WHERE id=?', [id])));
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.get('/history', async (req, res) => {
  try {
    await getDb();
    const { endpoint_id, limit=100, offset=0 } = req.query;
    const rows = endpoint_id
      ? await query('SELECT * FROM test_results WHERE endpoint_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?', [endpoint_id, +limit, +offset])
      : await query('SELECT * FROM test_results ORDER BY created_at DESC LIMIT ? OFFSET ?', [+limit, +offset]);
    res.json(rows.map(parseResult));
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.get('/stats/:endpointId', async (req, res) => {
  try {
    await getDb();
    const periodMs = { '1h':36e5, '24h':864e5, '7d':6048e5, '30d':2592e6 }[req.query.period||'24h'] || 864e5;
    const rows = await query('SELECT * FROM test_results WHERE endpoint_id=? AND created_at>=? ORDER BY created_at ASC',
      [req.params.endpointId, Date.now()-periodMs]);
    if (!rows.length) return res.json({ count:0, avg_ms:null, min_ms:null, max_ms:null, p95_ms:null, error_rate:0, slow_rate:0, series:[] });
    const times = rows.filter(r=>r.response_time!=null).map(r=>r.response_time).sort((a,b)=>a-b);
    const errors = rows.filter(r=>r.error||(r.status_code>=500)).length;
    res.json({
      count: rows.length,
      avg_ms: times.length ? Math.round(times.reduce((s,v)=>s+v,0)/times.length) : null,
      min_ms: times[0]??null, max_ms: times[times.length-1]??null,
      p95_ms: times[Math.floor(times.length*0.95)]??null,
      error_rate: +(errors/rows.length*100).toFixed(1),
      slow_rate: +(rows.filter(r=>r.is_slow).length/rows.length*100).toFixed(1),
      series: rows.map(r=>({ t:r.created_at, ms:r.response_time, status:r.status_code, error:r.error, slow:r.is_slow })),
    });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.delete('/history/:endpointId', async (req, res) => {
  try {
    await getDb();
    await run('DELETE FROM test_results WHERE endpoint_id=?', [req.params.endpointId]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

function parseResult(row) {
  if (!row) return null;
  try { row.response_headers = JSON.parse(row.response_headers); } catch { row.response_headers = {}; }
  try { row.request_headers  = JSON.parse(row.request_headers);  } catch { row.request_headers  = {}; }
  row.is_slow = !!row.is_slow;
  return row;
}

module.exports = router;