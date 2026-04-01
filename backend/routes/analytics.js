'use strict';

const express = require('express');
const { query } = require('../config/snowflake');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// ─── GET /api/analytics/:deviceId ────────────────────────────────────────────
// Returns per-day aggregates for the last N days (default 30).
// Query params: ?days=30
router.get(
  '/:deviceId',
  asyncHandler(async (req, res) => {
    const { deviceId } = req.params;
    const days = Math.min(Math.max(parseInt(req.query.days || '30', 10), 1), 365);

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required.' });
    }

    // Daily summary: total created, total completed, completion rate
    const dailyRows = await query(
      `SELECT task_date::VARCHAR                              AS task_date,
              COUNT(*)                                        AS total_tasks,
              SUM(IFF(is_completed, 1, 0))                   AS completed_tasks,
              ROUND(
                SUM(IFF(is_completed, 1, 0)) * 100.0 / NULLIF(COUNT(*), 0),
                1
              )                                              AS completion_rate_pct
         FROM user_daily_tasks
        WHERE device_id = ?
          AND task_date >= DATEADD(DAY, -?, CURRENT_DATE())
        GROUP BY task_date
        ORDER BY task_date ASC`,
      [deviceId, days]
    );

    // Overall summary
    const summaryRows = await query(
      `SELECT COUNT(*)                              AS total_tasks,
              SUM(IFF(is_completed, 1, 0))          AS completed_tasks,
              COUNT(DISTINCT task_date)             AS active_days,
              MIN(task_date)::VARCHAR               AS first_task_date,
              MAX(task_date)::VARCHAR               AS last_task_date
         FROM user_daily_tasks
        WHERE device_id = ?`,
      [deviceId]
    );

    return res.json({
      success: true,
      summary: summaryRows[0] || {},
      daily: dailyRows,
    });
  })
);

module.exports = router;
