import { createApp } from './app';
import { getDatabase } from './db';

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
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
