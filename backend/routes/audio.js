'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { transcribeAudio, synthesiseTasks } = require('../utils/llm');
const { query } = require('../config/snowflake');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// ─── Multer configuration ─────────────────────────────────────────────────────
const MAX_BYTES = parseInt(process.env.MAX_AUDIO_SIZE_MB || '25', 10) * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(os.tmpdir(), 'task-audio');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.m4a';
    cb(null, `audio-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav',
                     'audio/ogg', 'audio/webm', 'audio/flac', 'video/webm'];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio type: ${file.mimetype}`));
    }
  },
});

// ─── Helper: cleanup temp file ────────────────────────────────────────────────
function safeUnlink(filePath) {
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}

// ─── Helper: insert task rows and return them ─────────────────────────────────
async function insertTasks(deviceId, taskDate, taskDescriptions) {
  const created = [];

  for (const description of taskDescriptions) {
    const trimmed = description.trim();
    if (!trimmed) continue;

    await query(
      `INSERT INTO user_daily_tasks (device_id, task_date, task_description)
       VALUES (?, ?::DATE, ?)`,
      [deviceId, taskDate, trimmed]
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
        WHERE device_id = ?
          AND task_date  = ?::DATE
          AND task_description = ?
        ORDER BY created_at DESC
        LIMIT 1`,
      [deviceId, taskDate, trimmed]
    );

    if (rows.length > 0) created.push(rows[0]);
  }

  return created;
}

// ─── POST /api/audio/upload ───────────────────────────────────────────────────
// Multipart form fields:
//   audio    — audio file (required)
//   deviceId — string (required)
//   taskDate — YYYY-MM-DD (required)
router.post(
  '/upload',
  upload.single('audio'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file provided.' });
    }

    const { deviceId, taskDate } = req.body;

    if (!deviceId || !taskDate || !/^\d{4}-\d{2}-\d{2}$/.test(taskDate)) {
      safeUnlink(req.file.path);
      return res.status(400).json({ success: false, error: 'deviceId and taskDate (YYYY-MM-DD) are required.' });
    }

    let transcript, tasks, createdTasks;

    try {
      // 1. Transcribe
      transcript = await transcribeAudio(req.file.path);

      if (!transcript || !transcript.trim()) {
        return res.json({ success: true, transcript: '', tasks: [] });
      }

      // 2. Extract tasks via LLM
      tasks = await synthesiseTasks(transcript);

      // 3. Persist to Snowflake
      createdTasks = await insertTasks(deviceId, taskDate, tasks);
    } finally {
      safeUnlink(req.file.path);
    }

    return res.status(201).json({
      success: true,
      transcript,
      tasks: createdTasks,
    });
  })
);

// ─── POST /api/audio/sync ─────────────────────────────────────────────────────
// Batch sync endpoint for the offline queue.
// Body: { items: Array<{ deviceId, taskDate, audioBase64, mimeType }> }
router.post(
  '/sync',
  asyncHandler(async (req, res) => {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'items array is required.' });
    }

    const results = [];

    for (const item of items) {
      const { deviceId, taskDate, audioBase64, mimeType } = item;

      if (!deviceId || !taskDate || !audioBase64) {
        results.push({ success: false, deviceId, taskDate, error: 'Missing required fields.' });
        continue;
      }

      // Write base64 audio to a temp file
      const ext = mimeType ? `.${mimeType.split('/')[1].replace('x-m4a', 'm4a')}` : '.m4a';
      const tempPath = path.join(os.tmpdir(), `sync-${Date.now()}${ext}`);

      try {
        fs.writeFileSync(tempPath, Buffer.from(audioBase64, 'base64'));

        const transcript = await transcribeAudio(tempPath);

        if (!transcript || !transcript.trim()) {
          results.push({ success: true, deviceId, taskDate, transcript: '', tasks: [] });
          continue;
        }

        const taskList = await synthesiseTasks(transcript);
        const createdTasks = await insertTasks(deviceId, taskDate, taskList);

        results.push({ success: true, deviceId, taskDate, transcript, tasks: createdTasks });
      } catch (err) {
        results.push({ success: false, deviceId, taskDate, error: err.message });
      } finally {
        safeUnlink(tempPath);
      }
    }

    return res.json({ success: true, results });
  })
);

module.exports = router;
