-- =============================================================================
-- Daily Task Manager — Snowflake Schema
-- Run this once against your Snowflake account to initialise the database.
-- All statements are idempotent (CREATE OR REPLACE / IF NOT EXISTS).
-- =============================================================================

-- Create database & schema if they do not already exist
CREATE DATABASE IF NOT EXISTS TASK_MANAGER_DB;
USE DATABASE TASK_MANAGER_DB;
CREATE SCHEMA IF NOT EXISTS PUBLIC;
USE SCHEMA PUBLIC;

-- Create warehouse (optional – use an existing one if preferred)
CREATE WAREHOUSE IF NOT EXISTS COMPUTE_WH
  WAREHOUSE_SIZE = 'X-SMALL'
  AUTO_SUSPEND   = 60
  AUTO_RESUME    = TRUE
  COMMENT        = 'Task Manager compute warehouse';

-- =============================================================================
-- Core table
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_daily_tasks (
    task_id          VARCHAR        DEFAULT UUID_STRING()   COMMENT 'Primary key – auto-generated UUID',
    device_id        VARCHAR        NOT NULL                COMMENT 'Persistent client-side device identifier',
    task_date        DATE           NOT NULL                COMMENT 'The calendar date this task belongs to',
    task_description VARCHAR(2000)  NOT NULL                COMMENT 'Human-readable task text',
    is_completed     BOOLEAN        DEFAULT FALSE           COMMENT 'Whether the task has been checked off',
    created_at       TIMESTAMP_NTZ  DEFAULT CURRENT_TIMESTAMP() COMMENT 'UTC timestamp of row insertion',
    completed_at     TIMESTAMP_NTZ                         COMMENT 'UTC timestamp when is_completed was set TRUE'
);

-- =============================================================================
-- Indexes / clustering (Snowflake uses micro-partition pruning automatically,
-- but an explicit cluster key speeds up date-range & device scans).
-- =============================================================================
ALTER TABLE user_daily_tasks
    CLUSTER BY (device_id, task_date);

-- =============================================================================
-- Useful analytical views
-- =============================================================================

-- Daily summary per device
CREATE OR REPLACE VIEW v_daily_summary AS
SELECT
    device_id,
    task_date,
    COUNT(*)                                          AS total_tasks,
    SUM(IFF(is_completed, 1, 0))                      AS completed_tasks,
    SUM(IFF(NOT is_completed, 1, 0))                  AS pending_tasks,
    ROUND(
        SUM(IFF(is_completed, 1, 0)) * 100.0 / NULLIF(COUNT(*), 0),
        1
    )                                                 AS completion_rate_pct
FROM user_daily_tasks
GROUP BY device_id, task_date;

-- Overall lifetime stats per device
CREATE OR REPLACE VIEW v_device_summary AS
SELECT
    device_id,
    COUNT(*)                                          AS total_tasks_ever,
    SUM(IFF(is_completed, 1, 0))                      AS total_completed_ever,
    COUNT(DISTINCT task_date)                         AS active_days,
    MIN(task_date)                                    AS first_task_date,
    MAX(task_date)                                    AS last_task_date,
    ROUND(
        SUM(IFF(is_completed, 1, 0)) * 100.0 / NULLIF(COUNT(*), 0),
        1
    )                                                 AS lifetime_completion_rate_pct
FROM user_daily_tasks
GROUP BY device_id;

-- =============================================================================
-- Sample verification query (run after inserting test data)
-- =============================================================================
-- SELECT * FROM v_daily_summary ORDER BY task_date DESC LIMIT 20;
