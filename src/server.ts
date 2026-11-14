import './config/env';
import { createApp } from './app';
import { closeDatabase, getDatabase } from './db';
import { verifyAiConfiguration } from './services/ai/healthcheck';

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Connect to PostgreSQL, take the migration advisory lock, and apply any
    // pending migrations before accepting traffic.
    await getDatabase();

    const app = createApp();
    const server = app.listen(PORT, () => {
      console.log(`🚀 NoteMind API Server listening on http://localhost:${PORT}`);
      console.log(`📑 OpenAPI Specification available in openapi.yaml`);
    });

    // Report dead/retired model ids at boot instead of at first user request.
    // Non-fatal: a failed check never blocks the server.
    void verifyAiConfiguration();

    let shuttingDown = false;

    const shutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[server] ${signal} received; finishing in-flight requests...`);

      // Stop accepting connections, let keep-alive clients finish, then close
      // the pool. Docker sends SIGTERM and waits up to stop_grace_period.
      server.close(async () => {
        try {
          await closeDatabase();
          console.log('[server] Database pool closed; shutdown complete.');
          process.exit(0);
        } catch (error) {
          console.error('[server] Error during shutdown:', error);
          process.exit(1);
        }
      });

      server.closeIdleConnections?.();

      // Never hang indefinitely if a client keeps a request open.
      setTimeout(() => {
        console.error('[server] Forced shutdown after timeout.');
        process.exit(1);
      }, 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  }
}

startServer();
