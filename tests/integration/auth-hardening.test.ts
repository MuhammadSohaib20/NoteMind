import request from 'supertest';
import { createApp } from '../../src/app';
import { getDatabase } from '../../src/db';
import { Express } from 'express';
import { runBackupAndRestoreDrill } from '../../scripts/backup-restore';

describe('Week 4 Authentication, Hardening & Backup Integration Tests', () => {
  let app: Express;
  let authToken: string;

  beforeAll(async () => {
    jest.setTimeout(30000);
    await getDatabase();
    app = createApp();
  });

  it('1. GET /api/v1/notes without Authorization header should return 401 Unauthorized', async () => {
    const res = await request(app).get('/api/v1/notes');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Unauthorized');
  });

  it('2. GET /api/v1/notes with invalid Bearer token should return 401 Unauthorized', async () => {
    const res = await request(app)
      .get('/api/v1/notes')
      .set('Authorization', 'Bearer invalid_token_123');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Expired or invalid token');
  });

  it('3. POST /api/v1/auth/signup with valid payload should return JWT token', async () => {
    const email = `auth-test-${Date.now()}@notemind.ai`;
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'StrongPassword123!' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();

    authToken = res.body.data.token;
  });

  it('4. Protected endpoint with valid JWT token should succeed and set rate limit headers', async () => {
    const res = await request(app)
      .get('/api/v1/collections')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });

  it('5. Database Backup and Restore Drill should execute without error and pass verification', async () => {
    await expect(runBackupAndRestoreDrill()).resolves.not.toThrow();
  }, 30000);
});
