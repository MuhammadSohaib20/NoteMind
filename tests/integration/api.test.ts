import request from 'supertest';
import { createApp } from '../../src/app';
import { getDatabase } from '../../src/db';
import { Express } from 'express';
import { setEmbeddingProvider, setGenerationProvider } from '../../src/services/ai';

describe('Express REST API Integration Tests', () => {
  let app: Express;
  let authToken: string;
  let createdCollectionId: string;
  let secondCollectionId: string;
  let createdCollectionColorIndex: number;
  let createdNoteId: string;
  let generalNoteId: string;
  let createdTagId: string;

  beforeAll(async () => {
    await getDatabase();
    // Hermetic suite: notes here are not AI-indexed, and a real GEMINI_API_KEY
    // in the environment must not turn /rag/ask into network calls. This keeps
    // the suite in the keyword-search (degraded) code path.
    setEmbeddingProvider(null);
    setGenerationProvider(null);
    app = createApp();
  });

  afterAll(() => {
    setEmbeddingProvider(null);
    setGenerationProvider(null);
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
    expect(Number.isInteger(res.body.data.colorIndex)).toBe(true);

    createdCollectionId = res.body.data.id;
    createdCollectionColorIndex = res.body.data.colorIndex;
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
    expect(res.body.data.colorIndex).toBe(createdCollectionColorIndex);
  });

  it('5a. New collections receive a new color without changing existing colors', async () => {
    const added = await request(app)
      .post('/api/v1/collections')
      .set('Authorization', 'Bearer ' + authToken)
      .send({ name: 'Second Color Collection' });
    expect(added.status).toBe(201);
    expect(added.body.data.colorIndex).not.toBe(createdCollectionColorIndex);
    secondCollectionId = added.body.data.id;

    const existing = await request(app)
      .get(`/api/v1/collections/${createdCollectionId}`)
      .set('Authorization', 'Bearer ' + authToken);
    expect(existing.body.data.colorIndex).toBe(createdCollectionColorIndex);
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

  it('8a. GET /api/v1/notes?generalOnly=true should return notes without a collection', async () => {
    const createdGeneralNote = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', 'Bearer ' + authToken)
      .send({
        title: 'Jest General Note',
        content: 'This note has no collection.',
      });
    expect(createdGeneralNote.status).toBe(201);
    generalNoteId = createdGeneralNote.body.data.id;

    const generalNotes = await request(app)
      .get('/api/v1/notes?generalOnly=true')
      .set('Authorization', 'Bearer ' + authToken);
    expect(generalNotes.status).toBe(200);
    expect(generalNotes.body.data.some((note: { id: string }) => note.id === generalNoteId)).toBe(true);
    expect(generalNotes.body.data.some((note: { id: string }) => note.id === createdNoteId)).toBe(false);

    await request(app)
      .delete(`/api/v1/notes/${generalNoteId}`)
      .set('Authorization', 'Bearer ' + authToken);
    const permanentDelete = await request(app)
      .delete(`/api/v1/notes/${generalNoteId}/permanent`)
      .set('Authorization', 'Bearer ' + authToken);
    expect(permanentDelete.status).toBe(200);
  });

  it('8b. PDF uploads should be served as PDF bytes without embedding them in note lists', async () => {
    const pdfBytes = Buffer.from('%PDF-1.4\n% test fixture\n');
    const uploaded = await request(app)
      .post('/api/v1/notes/upload')
      .set('Authorization', 'Bearer ' + authToken)
      .attach('file', pdfBytes, {
        filename: 'reader-test.pdf',
        contentType: 'application/octet-stream',
      });

    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data.fileData).toBeUndefined();

    const file = await request(app)
      .get(`/api/v1/notes/${uploaded.body.data.id}/file`)
      .set('Authorization', 'Bearer ' + authToken);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/^application\/pdf/);
    expect(file.body).toEqual(pdfBytes);

    const notes = await request(app)
      .get('/api/v1/notes')
      .set('Authorization', 'Bearer ' + authToken);
    expect(notes.body.data.find((note: { id: string }) => note.id === uploaded.body.data.id).fileData).toBeUndefined();

    const trashed = await request(app)
      .delete(`/api/v1/notes/${uploaded.body.data.id}`)
      .set('Authorization', 'Bearer ' + authToken);
    expect(trashed.status).toBe(200);

    const removed = await request(app)
      .delete(`/api/v1/notes/${uploaded.body.data.id}/permanent`)
      .set('Authorization', 'Bearer ' + authToken);
    expect(removed.status).toBe(200);
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

    const hiddenNotes = await request(app)
      .get('/api/v1/notes')
      .set('Authorization', 'Bearer ' + authToken);
    expect(hiddenNotes.body.data.some((note: { id: string }) => note.id === createdNoteId)).toBe(false);

    const trash = await request(app)
      .get('/api/v1/notes/trash')
      .set('Authorization', 'Bearer ' + authToken);
    expect(trash.status).toBe(200);
    expect(trash.body.data.some((note: { id: string }) => note.id === createdNoteId)).toBe(true);

    const trashedRag = await request(app)
      .post('/api/v1/rag/ask')
      .set('Authorization', 'Bearer ' + authToken)
      .send({ question: 'What is the note content for pgvector integration?' });
    expect(trashedRag.body.data.retrievedNotes.some((note: { id: string }) => note.id === createdNoteId)).toBe(false);

    const restore = await request(app)
      .post(`/api/v1/notes/${createdNoteId}/restore`)
      .set('Authorization', 'Bearer ' + authToken);
    expect(restore.status).toBe(200);
    const restoredNote = await request(app)
      .get(`/api/v1/notes/${createdNoteId}`)
      .set('Authorization', 'Bearer ' + authToken);
    expect(restoredNote.status).toBe(200);

    await request(app)
      .delete(`/api/v1/notes/${createdNoteId}`)
      .set('Authorization', 'Bearer ' + authToken);
    const permanentlyDeleted = await request(app)
      .delete(`/api/v1/notes/${createdNoteId}/permanent`)
      .set('Authorization', 'Bearer ' + authToken);
    expect(permanentlyDeleted.status).toBe(200);

    const collectionNote = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', 'Bearer ' + authToken)
      .send({
        collectionId: createdCollectionId,
        title: 'Note trashed with collection',
        content: 'Deleting its collection should move this note to Trash.',
      });
    expect(collectionNote.status).toBe(201);

    const colDel = await request(app)
      .delete(`/api/v1/collections/${createdCollectionId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(colDel.status).toBe(200);
    const activeAfterCollectionDelete = await request(app)
      .get('/api/v1/notes')
      .set('Authorization', 'Bearer ' + authToken);
    expect(
      activeAfterCollectionDelete.body.data.some(
        (note: { id: string }) => note.id === collectionNote.body.data.id
      )
    ).toBe(false);

    const trashAfterCollectionDelete = await request(app)
      .get('/api/v1/notes/trash')
      .set('Authorization', 'Bearer ' + authToken);
    expect(
      trashAfterCollectionDelete.body.data.some(
        (note: { id: string }) => note.id === collectionNote.body.data.id
      )
    ).toBe(true);

    const removeCollectionNote = await request(app)
      .delete(`/api/v1/notes/${collectionNote.body.data.id}/permanent`)
      .set('Authorization', 'Bearer ' + authToken);
    expect(removeCollectionNote.status).toBe(200);

    const secondColDel = await request(app)
      .delete(`/api/v1/collections/${secondCollectionId}`)
      .set('Authorization', 'Bearer ' + authToken);
    expect(secondColDel.status).toBe(200);

    const tagDel = await request(app)
      .delete(`/api/v1/tags/${createdTagId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(tagDel.status).toBe(200);
  });
});
