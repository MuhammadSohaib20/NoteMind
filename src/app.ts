import './config/env';
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth.routes';
import collectionRoutes from './routes/collections.routes';
import noteRoutes from './routes/notes.routes';
import tagRoutes from './routes/tags.routes';
import ragRoutes from './routes/rag.routes';
import { errorHandler } from './middleware/errorHandler';
import { structuredLogger } from './middleware/logger';
import { authRateLimiter, apiRateLimiter } from './middleware/rateLimiter';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(structuredLogger);

  // Health check. `startedAt` is the boot timestamp: the client polls it and
  // reloads when it changes, so a page can never keep running code that
  // predates a server restart (the dev workflow restarts the server to pick
  // up updates — an already-open tab must follow).
  const SERVER_STARTED_AT = Date.now();
  app.get('/health', (req: Request, res: Response) => {
    res
      .status(200)
      .json({ status: 'ok', service: 'NoteMind API', timestamp: new Date().toISOString(), startedAt: SERVER_STARTED_AT });
  });

  // API Routes (v1) with rate limiting
  app.use('/api/v1/auth', authRateLimiter, authRoutes);
  app.use('/api/v1/collections', apiRateLimiter, collectionRoutes);
  app.use('/api/v1/notes', apiRateLimiter, noteRoutes);
  app.use('/api/v1/tags', apiRateLimiter, tagRoutes);
  app.use('/api/v1/rag', apiRateLimiter, ragRoutes);

  // Serve React Frontend Statically (if client/dist exists)
  const clientDistPath = path.join(__dirname, '../client/dist');
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api') || req.path === '/health') return next();
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
