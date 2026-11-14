const path = require('path');

// Load .env only when the variable is not already provided by CI or the shell.
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: false });

/**
 * Tests must never run against the development database. Unless an explicit
 * TEST_DATABASE_URL is provided, derive a sibling database named `<db>_test`.
 * The global setup recreates that database from scratch before every run.
 */
function resolveTestDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }

  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'DATABASE_URL is not set. Start PostgreSQL (docker compose up -d db) or provide TEST_DATABASE_URL.'
    );
  }

  const url = new URL(base);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'notemind';

  if (!databaseName.endsWith('_test')) {
    url.pathname = `/${databaseName}_test`;
  }

  return url.toString();
}

module.exports = { resolveTestDatabaseUrl };
