// Runs before the test framework boots (jest `setupFiles`), so modules that
// import src/middleware/auth.ts see a JWT_SECRET. The server itself refuses to
// start without one; tests use this dedicated throwaway value instead.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'notemind-local-test-secret-2026';
