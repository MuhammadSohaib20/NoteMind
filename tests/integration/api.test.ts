import request from 'supertest';
import { createApp } from '../../src/app';
import { getDatabase } from '../../src/db';
import { Express } from 'express';

describe('Express REST API Integration Tests', () => {
  let app: Express;
  let authToken: string;
  let createdCollectionId: string;
  let createdNoteId: string;
  let createdTagId: string;

  beforeAll(async () => {
    await getDatabase();
    app = createApp();
  });

  it('1. GET /health should return status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('2. POST /api/v1/auth/signup should register a new user', async () => {
    const testEmail = `jest-test-${Date.now()}@notemind.ai`;
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: testEmail, password: 'SecurePassword123' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();

    authToken = res.body.data.token;
  });

  it('3. POST /api/v1/collections should create a new collection', async () => {
    const res = await request(app)
      .post('/api/v1/collections')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Jest Integration Collection' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Jest Integration Collection');

    createdCollectionId = res.body.data.id;
  });

  it('4. GET /api/v1/collections/:id should get collection details', async () => {
    const res = await request(app)
      .get(`/api/v1/collections/${createdCollectionId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(createdCollectionId);
  });

  it('5. PUT /api/v1/collections/:id should update collection name', async () => {
    const res = await request(app)
      .put(`/api/v1/collections/${createdCollectionId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Updated Integration Collection' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Updated Integration Collection');
  });

  it('6. POST /api/v1/tags should create a standalone tag', async () => {
    const res = await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'jest-standalone-tag' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('jest-standalone-tag');

    createdTagId = res.body.data.id;
  });

  it('7. PUT /api/v1/tags/:id should update tag name', async () => {
    const res = await request(app)
      .put(`/api/v1/tags/${createdTagId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'jest-updated-tag' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('jest-updated-tag');
  });

  it('8. POST /api/v1/notes should create a note with embeddings and tags', async () => {
    const res = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        collectionId: createdCollectionId,
        title: 'Jest Test Note Title',
        content: 'Content verifying full note lifecycle in Express and pgvector.',
        tags: ['jest', 'integration', 'pgvector'],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Jest Test Note Title');

    createdNoteId = res.body.data.id;
  });

  it('9. GET /api/v1/notes/:id should return created note', async () => {
    const res = await request(app)
      .get(`/api/v1/notes/${createdNoteId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Jest Test Note Title');
  });

  it('10. POST /api/v1/rag/ask should retrieve note and generate RAG response', async () => {
    const res = await request(app)
      .post('/api/v1/rag/ask')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ question: 'What is the note content for pgvector integration?' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.retrievedNotes.length).toBeGreaterThan(0);
  });

  it('11. DELETE endpoints should remove created resources', async () => {
    const noteDel = await request(app)
      .delete(`/api/v1/notes/${createdNoteId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(noteDel.status).toBe(200);

    const colDel = await request(app)
      .delete(`/api/v1/collections/${createdCollectionId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(colDel.status).toBe(200);

    const tagDel = await request(app)
      .delete(`/api/v1/tags/${createdTagId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(tagDel.status).toBe(200);
  });
});
