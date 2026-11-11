const { Client } = require('pg');
const { resolveTestDatabaseUrl } = require('./testDatabaseUrl');

/**
 * Recreates the dedicated test database before Jest starts. This guarantees a
 * clean schema and no leftovers from a previous run, while never touching the
 * development/production database.
 */
module.exports = async () => {
  const testUrl = resolveTestDatabaseUrl();
  const url = new URL(testUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));

  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to recreate "${databaseName}": the test database name must end with "_test".`
    );
  }

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();

  try {
    // Drop stale connections left by a previous forced exit.
    await admin.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid();`,
      [databaseName]
    );

    const quoted = `"${databaseName.replace(/"/g, '""')}"`;
    await admin.query(`DROP DATABASE IF EXISTS ${quoted};`);
    await admin.query(`CREATE DATABASE ${quoted};`);
  } finally {
    await admin.end();
  }
};
