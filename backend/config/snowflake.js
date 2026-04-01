'use strict';

require('dotenv').config();
const snowflake = require('snowflake-sdk');

// Snowflake connection pool
let connectionPool = null;

function createPool() {
  if (connectionPool) return connectionPool;

  const poolOptions = {
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USERNAME,
    password: process.env.SNOWFLAKE_PASSWORD,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    role: process.env.SNOWFLAKE_ROLE,
    insecureConnect: false,
  };

  connectionPool = snowflake.createPool(poolOptions, {
    max: 10,
    min: 1,
  });

  return connectionPool;
}

/**
 * Execute a SQL statement with optional binds.
 * Returns an array of row objects.
 */
async function query(sqlText, binds = []) {
  const pool = createPool();

  return new Promise((resolve, reject) => {
    pool.use(async (conn) => {
      conn.execute({
        sqlText,
        binds,
        complete: (err, stmt, rows) => {
          if (err) {
            reject(new Error(`Snowflake query error: ${err.message}`));
            return;
          }
          resolve(rows || []);
        },
      });
    });
  });
}

/**
 * Initialize the database schema (idempotent).
 */
async function initSchema() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS user_daily_tasks (
      task_id       VARCHAR        DEFAULT UUID_STRING(),
      device_id     VARCHAR        NOT NULL,
      task_date     DATE           NOT NULL,
      task_description VARCHAR     NOT NULL,
      is_completed  BOOLEAN        DEFAULT FALSE,
      created_at    TIMESTAMP_NTZ  DEFAULT CURRENT_TIMESTAMP(),
      completed_at  TIMESTAMP_NTZ
    )
  `;
  await query(ddl);
  console.log('[Snowflake] Schema initialised.');
}

module.exports = { query, initSchema };
