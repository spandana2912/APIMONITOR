require('dotenv').config();
const express = require('express');
const cors = require('cors');


const endpointsRouter = require('./routes/endpoints');
const testsRouter = require('./routes/tests');
const dashboardRouter = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Logger
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(new Date().toISOString() + " " + req.method + " " + req.path);
  }
  next();
});

// Root route
app.get('/', (_req, res) => {
  res.send("API Monitor Backend is Running");
});

// API routes
app.use('/api/endpoints', endpointsRouter);
app.use('/api/tests', testsRouter);
app.use('/api/dashboard', dashboardRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: Date.now() });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log("API Monitor backend running on port " + PORT);
});