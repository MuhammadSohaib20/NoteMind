// Runs before the test framework boots (jest `setupFiles`), so modules that
// import src/middleware/auth.ts see a JWT_SECRET. The server itself refuses to
// start without one; tests use this dedicated throwaway value instead.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'notemind-local-test-secret-2026';

// Point every test file at the disposable database created by globalSetup.
// This must happen before src/config/env loads dotenv (override: false), so the
// test URL wins over the development DATABASE_URL in .env.
const { resolveTestDatabaseUrl } = require('./testDatabaseUrl');
process.env.DATABASE_URL = resolveTestDatabaseUrl();
