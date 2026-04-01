-- =============================================================================
-- Daily Task Manager — Supabase / PostgreSQL Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- All statements are idempotent.
-- =============================================================================

-- Enable pgcrypto for gen_random_uuid() (already available in Supabase by default)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Core table
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_daily_tasks (
    task_id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id        TEXT          NOT NULL,
    task_date        DATE          NOT NULL,
    task_description TEXT          NOT NULL CHECK (char_length(task_description) <= 2000),
    is_completed     BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ
);

-- Composite index for the most common query pattern (device + date)
CREATE INDEX IF NOT EXISTS idx_tasks_device_date
    ON user_daily_tasks (device_id, task_date);

-- =============================================================================
-- Row Level Security
-- Since there is no user auth, we use the service-role key server-side
-- (Edge Functions) and restrict the anon key to read-nothing by default.
-- Edge Functions bypass RLS because they use the service-role key.
-- =============================================================================
ALTER TABLE user_daily_tasks ENABLE ROW LEVEL SECURITY;

-- No policies needed for anon/authenticated roles — all access goes
-- through Edge Functions using the service-role key.

-- =============================================================================
-- Supabase Storage bucket for audio recordings
-- Run this AFTER creating the table, or do it in Dashboard → Storage.
-- =============================================================================
-- The bucket is created via the Supabase JS client or Dashboard.
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('audio-recordings', 'audio-recordings', false)
-- ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Analytical views
-- =============================================================================
CREATE OR REPLACE VIEW v_daily_summary AS
SELECT
    device_id,
    task_date,
    COUNT(*)                                                        AS total_tasks,
    COUNT(*) FILTER (WHERE is_completed)                            AS completed_tasks,
    COUNT(*) FILTER (WHERE NOT is_completed)                        AS pending_tasks,
    ROUND(
        COUNT(*) FILTER (WHERE is_completed) * 100.0 / NULLIF(COUNT(*), 0),
        1
    )                                                               AS completion_rate_pct
FROM user_daily_tasks
GROUP BY device_id, task_date;

CREATE OR REPLACE VIEW v_device_summary AS
SELECT
    device_id,
    COUNT(*)                                                        AS total_tasks_ever,
    COUNT(*) FILTER (WHERE is_completed)                            AS total_completed_ever,
    COUNT(DISTINCT task_date)                                       AS active_days,
    MIN(task_date)                                                  AS first_task_date,
    MAX(task_date)                                                  AS last_task_date,
    ROUND(
        COUNT(*) FILTER (WHERE is_completed) * 100.0 / NULLIF(COUNT(*), 0),
        1
    )                                                               AS lifetime_completion_rate_pct
FROM user_daily_tasks
GROUP BY device_id;

-- =============================================================================
-- Verification
-- =============================================================================
-- SELECT * FROM v_daily_summary ORDER BY task_date DESC LIMIT 20;
