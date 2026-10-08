import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';

export function structuredLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const { method, originalUrl } = req;
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const userId = (req as AuthenticatedRequest).user?.id || 'anonymous';

    const logPayload = {
      timestamp: new Date().toISOString(),
      level: statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO',
      method,
      url: originalUrl,
      status: statusCode,
      durationMs: duration,
      ip,
      userId,
    };

    // Output structured JSON log line
    console.log(JSON.stringify(logPayload));
  });

  next();
}
