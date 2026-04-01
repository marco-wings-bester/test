'use strict';

require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const { initSchema } = require('./config/snowflake');
const tasksRouter = require('./routes/tasks');
const audioRouter = require('./routes/audio');
const analyticsRouter = require('./routes/analytics');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));       // for base64 sync payloads
app.use(express.urlencoded({ extended: true }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/tasks', tasksRouter);
app.use('/api/audio', audioRouter);
app.use('/api/analytics', analyticsRouter);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ success: false, error: 'Route not found.' }));

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await initSchema();
    app.listen(PORT, () => {
      console.log(`[Server] Task Manager API listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err.message);
    process.exit(1);
  }
})();
