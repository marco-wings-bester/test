'use strict';

const express = require('express');
const { query } = require('../config/snowflake');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// ─── GET /api/tasks/:deviceId/:date ──────────────────────────────────────────
// Fetch all tasks for a given device on a specific date (YYYY-MM-DD).
router.get(
  '/:deviceId/:date',
  asyncHandler(async (req, res) => {
    const { deviceId, date } = req.params;

    if (!deviceId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, error: 'Invalid deviceId or date format (expected YYYY-MM-DD).' });
    }

    const rows = await query(
      `SELECT task_id,
              device_id,
              task_date::VARCHAR         AS task_date,
              task_description,
              is_completed,
              created_at::VARCHAR        AS created_at,
              completed_at::VARCHAR      AS completed_at
         FROM user_daily_tasks
        WHERE device_id = ?
          AND task_date  = ?::DATE
        ORDER BY created_at ASC`,
      [deviceId, date]
    );

    return res.json({ success: true, tasks: rows });
  })
);

// ─── POST /api/tasks ──────────────────────────────────────────────────────────
// Create one or more tasks manually.
// Body: { deviceId, taskDate, tasks: string[] }
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { deviceId, taskDate, tasks } = req.body;

    if (!deviceId || !taskDate || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ success: false, error: 'deviceId, taskDate, and a non-empty tasks array are required.' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(taskDate)) {
      return res.status(400).json({ success: false, error: 'taskDate must be YYYY-MM-DD.' });
    }

    const created = [];

    for (const description of tasks) {
      const trimmed = typeof description === 'string' ? description.trim() : '';
      if (!trimmed) continue;

      const rows = await query(
        `INSERT INTO user_daily_tasks (device_id, task_date, task_description)
         VALUES (?, ?::DATE, ?)`,
        [deviceId, taskDate, trimmed]
      );

      // Fetch the newly inserted row by using LAST_QUERY_ID()
      const inserted = await query(
        `SELECT task_id,
                device_id,
                task_date::VARCHAR    AS task_date,
                task_description,
                is_completed,
                created_at::VARCHAR  AS created_at,
                completed_at::VARCHAR AS completed_at
           FROM user_daily_tasks
          WHERE device_id  = ?
            AND task_date   = ?::DATE
            AND task_description = ?
          ORDER BY created_at DESC
          LIMIT 1`,
        [deviceId, taskDate, trimmed]
      );

      if (inserted.length > 0) created.push(inserted[0]);
    }

    return res.status(201).json({ success: true, tasks: created });
  })
);

// ─── PUT /api/tasks/:taskId ───────────────────────────────────────────────────
// Update a task's description and/or completion status.
// Body: { taskDescription?, isCompleted? }
router.put(
  '/:taskId',
  asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const { taskDescription, isCompleted } = req.body;

    if (taskDescription === undefined && isCompleted === undefined) {
      return res.status(400).json({ success: false, error: 'Provide taskDescription and/or isCompleted.' });
    }

    // Build dynamic SET clause
    const setClauses = [];
    const binds = [];

    if (taskDescription !== undefined) {
      const trimmed = taskDescription.trim();
      if (!trimmed) return res.status(400).json({ success: false, error: 'taskDescription cannot be empty.' });
      setClauses.push('task_description = ?');
      binds.push(trimmed);
    }

    if (isCompleted !== undefined) {
      const completing = isCompleted === true || isCompleted === 'true' || isCompleted === 1;
      setClauses.push('is_completed = ?');
      binds.push(completing);
      // Set or clear completed_at
      setClauses.push('completed_at = ?');
      binds.push(completing ? new Date().toISOString() : null);
    }

    binds.push(taskId);

    await query(
      `UPDATE user_daily_tasks
          SET ${setClauses.join(', ')}
        WHERE task_id = ?`,
      binds
    );

    const rows = await query(
      `SELECT task_id,
              device_id,
              task_date::VARCHAR    AS task_date,
              task_description,
              is_completed,
              created_at::VARCHAR  AS created_at,
              completed_at::VARCHAR AS completed_at
         FROM user_daily_tasks
        WHERE task_id = ?`,
      [taskId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found.' });
    }

    return res.json({ success: true, task: rows[0] });
  })
);

// ─── DELETE /api/tasks/:taskId ────────────────────────────────────────────────
router.delete(
  '/:taskId',
  asyncHandler(async (req, res) => {
    const { taskId } = req.params;

    await query('DELETE FROM user_daily_tasks WHERE task_id = ?', [taskId]);

    return res.json({ success: true, message: 'Task deleted.' });
  })
);

module.exports = router;
