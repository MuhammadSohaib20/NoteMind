import dotenv from 'dotenv';

// Loaded once, first, so that every module reading process.env (including
// JWT_SECRET and DATABASE_URL) sees the values from .env.
dotenv.config({ override: false });
