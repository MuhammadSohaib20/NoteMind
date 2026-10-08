import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
}

interface RequestRecord {
  count: number;
  resetTime: number;
}

export function createRateLimiter(options: RateLimitConfig) {
  const windowMs = options.windowMs;
  const max = options.max;
  const message = options.message || 'Too many requests, please try again later.';
  
  const hits = new Map<string, RequestRecord>();

  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key);
      }
    }
  }, Math.min(windowMs, 60000));

  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const key = `${req.baseUrl || ''}${req.path || ''}:${ip}`;
    const now = Date.now();

    let record = hits.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      hits.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const resetTimeSec = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', max.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000).toString());

    if (record.count > max) {
      res.setHeader('Retry-After', resetTimeSec.toString());
      return res.status(429).json({
        success: false,
        error: {
          message,
        },
      });
    }

    next();
  };
}

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                  // 10 attempts
  message: 'Too many authentication attempts. Please try again after 15 minutes.',
});

export const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,                 // 200 requests per 15 mins
  message: 'API rate limit exceeded. Please slow down your requests.',
});
