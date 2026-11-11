// Each Jest test file gets its own module registry and therefore its own pool.
// Close it after the file so `--runInBand` does not leak connections between
// suites. `forceExit` remains a final safety net.
afterAll(async () => {
  try {
    const { closeDatabase } = require('../src/db');
    await closeDatabase();
  } catch {
    // A suite may have failed before the pool was created.
  }
});
