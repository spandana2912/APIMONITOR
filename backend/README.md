# 🚀 API Testing & Monitoring Tool

A full-stack developer tool for testing HTTP APIs, tracking performance over time, and detecting slow or failing endpoints — with a real-time dashboard.

---

## 📁 Project Architecture

```
api-monitor/
├── backend/                        # Node.js + Express REST API
│   ├── server.js                   # Entry point — mounts all routes
│   ├── package.json
│   ├── .env.example
│   ├── data/
│   │   └── monitor.db              # SQLite database (auto-created)
│   ├── models/
│   │   └── db.js                   # DB connection + schema init
│   ├── routes/
│   │   ├── endpoints.js            # CRUD for saved API endpoints
│   │   ├── tests.js                # Run tests, fetch history, stats
│   │   └── dashboard.js            # Overview, alerts, compare
│   └── utils/
│       └── requester.js            # HTTP executor with timing
│
└── frontend/
    └── index.html                  # Single-file SPA (vanilla JS + Chart.js)
```

---

## 🗄️ Database Schema (SQLite)

```sql
-- Saved API Endpoints
endpoints (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  method        TEXT NOT NULL DEFAULT 'GET',
  headers       TEXT DEFAULT '{}',          -- JSON string
  body          TEXT DEFAULT '',
  threshold_ms  INTEGER DEFAULT 1000,       -- slow detection threshold
  tags          TEXT DEFAULT '',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
)

-- Every individual test execution result
test_results (
  id                TEXT PRIMARY KEY,
  endpoint_id       TEXT → endpoints(id),   -- nullable (ad-hoc tests)
  url               TEXT NOT NULL,
  method            TEXT NOT NULL,
  status_code       INTEGER,
  response_time     INTEGER,                -- milliseconds
  response_body     TEXT,
  request_headers   TEXT DEFAULT '{}',
  request_body      TEXT DEFAULT '',
  response_headers  TEXT DEFAULT '{}',
  error             TEXT,                   -- null if success
  is_slow           INTEGER DEFAULT 0,      -- 1 if > threshold_ms
  threshold_ms      INTEGER DEFAULT 1000,
  created_at        INTEGER NOT NULL
)

-- Scheduled Monitors (future: cron-based polling)
monitors (
  id           TEXT PRIMARY KEY,
  endpoint_id  TEXT → endpoints(id),
  interval_sec INTEGER NOT NULL DEFAULT 60,
  is_active    INTEGER DEFAULT 1,
  last_run_at  INTEGER,
  created_at   INTEGER NOT NULL
)

-- Alerts: slow / error / down
alerts (
  id           TEXT PRIMARY KEY,
  endpoint_id  TEXT → endpoints(id),
  result_id    TEXT → test_results(id),
  type         TEXT NOT NULL,              -- 'slow' | 'error' | 'down'
  message      TEXT,
  acknowledged INTEGER DEFAULT 0,
  created_at   INTEGER NOT NULL
)
```

---

## ⚙️ Backend API Reference

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET    | /api/endpoints | List all saved endpoints |
| POST   | /api/endpoints | Create a new endpoint |
| GET    | /api/endpoints/:id | Get one endpoint |
| PUT    | /api/endpoints/:id | Update an endpoint |
| DELETE | /api/endpoints/:id | Delete endpoint + its history |

### Tests
| Method | Path | Description |
|--------|------|-------------|
| POST   | /api/tests/run | Run a one-off test (body: url, method, headers, body, threshold_ms) |
| POST   | /api/tests/run/:endpointId | Run a saved endpoint |
| GET    | /api/tests/history | Get all history (query: endpoint_id, limit, offset) |
| GET    | /api/tests/stats/:endpointId | Performance stats (query: period=1h\|24h\|7d\|30d) |
| DELETE | /api/tests/:id | Delete one result |
| DELETE | /api/tests/history/:endpointId | Clear endpoint history |

### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET    | /api/dashboard/overview | Summary stats + recent alerts + slowest endpoints |
| GET    | /api/dashboard/alerts | All alerts (query: unread_only=1) |
| PATCH  | /api/dashboard/alerts/:id/ack | Acknowledge an alert |
| PATCH  | /api/dashboard/alerts/ack-all | Acknowledge all alerts |
| GET    | /api/dashboard/compare | Compare endpoints (query: ids[]=…&period=…) |

---

## 🛠️ Step-by-Step Setup

### Prerequisites
- Node.js >= 18
- npm >= 8

### 1. Clone / extract the project
```bash
cd api-monitor
```

### 2. Install backend dependencies
```bash
cd backend
npm install
```

### 3. Configure environment (optional)
```bash
cp .env.example .env
# Edit PORT, FRONTEND_URL as needed
```

### 4. Start the backend
```bash
npm run dev       # development (nodemon auto-restart)
# OR
npm start         # production
```
Backend runs on **http://localhost:4000**

### 5. Open the frontend
```bash
# Simply open in a browser — no build step needed
open ../frontend/index.html

# OR serve it with any static server:
npx serve ../frontend
# → visit http://localhost:3000
```

---

## 🎯 Features Walkthrough

### ⚡ API Tester
- Enter any URL with GET/POST/PUT/PATCH/DELETE/HEAD
- Add custom headers (JSON) and request body
- Set per-test slow threshold (ms)
- View status code, response time, response body, and response headers
- Slow responses are flagged with ⚠ banner

### 📋 Test History
- All past tests stored in SQLite
- Filter by saved endpoint
- Shows: method, URL, status, time, slow/error flags, timestamp

### 🔗 Saved Endpoints
- Save frequently-used APIs with name, method, URL, headers, body, threshold
- Click any saved endpoint to view stats and recent history
- Edit or delete endpoints at any time
- Mini response-time chart per endpoint

### 📊 Dashboard
- Total endpoints, tests today, avg response time (24h), slow count, error count
- Recent unacknowledged alerts with one-click acknowledgement
- Top 5 slowest endpoints by average response time (24h)
- Response time trend chart across all recent tests

### ⚖️ Compare
- Select 2+ saved endpoints
- Choose time period: 1h / 24h / 7d / 30d
- Side-by-side table: avg, min, max, run count, slow%, error%
- Bar chart visualization

---

## 🔍 Slow API Detection Logic

A response is marked **slow** when:

```
response_time > threshold_ms  AND  request completed (no timeout)
```

Slow thresholds are configurable:
- **Per endpoint**: set when creating/editing a saved endpoint
- **Per ad-hoc test**: set in the Tester form (default 1000ms)

When a slow response is detected, an **alert** is automatically created and shown in the Dashboard.

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend framework | Express.js (Node.js) |
| Database | SQLite via `better-sqlite3` |
| HTTP client (backend) | Axios |
| Frontend | Vanilla JS SPA (no build required) |
| Charts | Chart.js 4 |
| Fonts | JetBrains Mono + Syne (Google Fonts) |
| IDs | UUID v4 |

---

## 📦 Extending the Tool

### Add scheduled monitoring (cron)
```js
// In server.js, add node-cron:
const cron = require('node-cron');
cron.schedule('* * * * *', async () => {
  const monitors = db.prepare('SELECT * FROM monitors WHERE is_active=1').all();
  for (const m of monitors) { /* run test for m.endpoint_id */ }
});
```

### Add authentication
Add a JWT middleware before routes:
```js
app.use('/api', require('./middleware/auth'));
```

### Export results to CSV
```js
router.get('/history/export', (req, res) => {
  const rows = db.prepare('SELECT * FROM test_results').all();
  const csv = rows.map(r => Object.values(r).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.send(csv);
});
```
