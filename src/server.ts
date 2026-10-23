import './config/env';
import { createApp } from './app';
import { getDatabase } from './db';
import { verifyAiConfiguration } from './services/ai/healthcheck';

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Ensure WASM PostgreSQL database is initialized with extensions & migrations
    await getDatabase();

    const app = createApp();

    app.listen(PORT, () => {
      console.log(`🚀 NoteMind API Server listening on http://localhost:${PORT}`);
      console.log(`📑 OpenAPI Specification available in openapi.yaml`);
    });

    // Report dead/retired model ids at boot instead of at first user request.
    // Non-fatal: a failed check never blocks the server.
    void verifyAiConfiguration();
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
