import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/app';
import { getDatabase } from '../../src/db';
import {
  setEmbeddingProvider,
  setGenerationProvider,
  clearEmbeddingCache,
} from '../../src/services/ai';
import { EmbeddingProvider, GenerationProvider, EmbedInput, EmbedTask } from '../../src/services/ai/types';

/**
 * Integration tests for the RAG pipeline.
 *
 * The providers are stubbed so the test exercises the real chunking,
 * pgvector storage and nearest-neighbour retrieval without spending provider
 * quota or requiring network access.
 */

const DIMENSIONS = 768;

/**
 * Maps related keywords onto shared dimensions so the stub behaves like a
 * real semantic embedding model: texts about the same topic land close
 * together, unrelated texts land far apart.
 */
const TOPIC_DIMENSIONS: Record<string, number> = {
  kubernetes: 0, k8s: 0, deployment: 0, deploy: 0, replicas: 0, replicaset: 0,
  replicasets: 0, kubectl: 0, container: 0, containers: 0, ingress: 0,
  orchestrator: 0, orchestrates: 0, rollout: 0, node: 0, nodes: 0,
  bread: 10, sourdough: 10, flour: 10, baking: 10, dough: 10, proof: 10,
  loaf: 10, starter: 10, ferment: 10, fermentation: 10, oven: 10, knead: 10,
  bulk: 10, dutch: 10, bake: 10, baked: 10,
};

function topicDimension(token: string): number {
  const mapped = TOPIC_DIMENSIONS[token];
  if (mapped !== undefined) return mapped;

  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = (hash << 5) - hash + token.charCodeAt(i);
    hash |= 0;
  }
  return 100 + (Math.abs(hash) % 600);
}

/** Deterministic topic-aware vector: related texts score a high cosine. */
function fakeVector(text: string): number[] {
  const vector = new Array(DIMENSIONS).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

  for (const token of tokens) {
    vector[topicDimension(token)] += 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}

class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'fake';
  readonly model = 'fake-embedding-model';
  readonly dimensions = DIMENSIONS;
  embedCallCount = 0;

  async embed(inputs: EmbedInput[], _task: EmbedTask): Promise<number[][]> {
    this.embedCallCount++;
    return inputs.map((input) => fakeVector(`${input.title ?? ''} ${input.text}`));
  }
}

class FakeGenerationProvider implements GenerationProvider {
  readonly name = 'fake';
  readonly model = 'fake-generation-model';

  async generate(req: { prompt: string }): Promise<string> {
    return `Generated answer for: ${req.prompt.split('Question:').pop()?.trim() ?? 'unknown'}`;
  }
}

describe('RAG Pipeline Integration Tests', () => {
  let app: Express;
  let authToken: string;
  let userId: string;
  let embedding: FakeEmbeddingProvider;
  let kubernetesNoteId: string;
  let breadNoteId: string;

  beforeAll(async () => {
    await getDatabase();
    // Hermetic tests: the on-disk cache must not leak between runs.
    clearEmbeddingCache();
    embedding = new FakeEmbeddingProvider();
    setEmbeddingProvider(embedding);
    setGenerationProvider(new FakeGenerationProvider());
    app = createApp();
  });

  afterAll(() => {
    setEmbeddingProvider(null);
    setGenerationProvider(null);
  });

  it('1. should register a user for RAG testing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: `rag-test-${Date.now()}@notemind.ai`, password: 'SecurePassword123' });

    expect(res.status).toBe(201);
    authToken = res.body.data.token;
    userId = res.body.data.user.id;
  });

  it('2. should create a note (indexing is now explicit, so it stays unindexed)', async () => {
    const res = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Kubernetes Deployment Guide',
        content:
          'Kubernetes orchestrates containers across nodes. A Deployment manages ReplicaSets. ' +
          'Use kubectl apply to roll out changes. Ingress controllers route external traffic.',
        tags: ['kubernetes', 'devops'],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    kubernetesNoteId = res.body.data.id;
    // Notes are only embedded via the explicit index endpoint.
    expect(res.body.data.indexed).toBe(false);
  });

  it('3. should create a second, unrelated note', async () => {
    const res = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Sourdough Bread Recipe',
        content:
          'Mix flour water salt and starter. Bulk ferment for four hours. ' +
          'Shape the loaf, proof overnight, then bake in a hot Dutch oven.',
        tags: ['baking'],
      });

    expect(res.status).toBe(201);
    breadNoteId = res.body.data.id;
  });

  it('3b. should only embed notes selected through POST /notes/index', async () => {
    const typecheck = await request(app)
      .post('/api/v1/notes/index')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ noteIds: [kubernetesNoteId, '11111111-2222-3333-4444-555555555555'] });

    expect(typecheck.status).toBe(200);
    expect(typecheck.body.data.summary.indexed).toBe(1);
    expect(typecheck.body.data.summary.failed).toBe(1);
    expect(typecheck.body.data.results[0].status).toBe('indexed');
    expect(typecheck.body.data.results[1].status).toBe('not_found');

    const res = await request(app)
      .post('/api/v1/notes/index')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ noteIds: [kubernetesNoteId, breadNoteId] });

    expect(res.status).toBe(200);
    expect(res.body.data.summary.requested).toBe(2);
    // The Kubernetes note was embedded in the previous call: it must be
    // skipped without touching the provider.
    expect(res.body.data.summary.indexed).toBe(1);
    expect(res.body.data.summary.upToDate).toBe(1);

    const callsAfterFirstIndex = embedding.embedCallCount;

    // Indexing again without changes must skip the provider entirely.
    const again = await request(app)
      .post('/api/v1/notes/index')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ noteIds: [kubernetesNoteId, breadNoteId] });

    expect(again.status).toBe(200);
    expect(again.body.data.summary.upToDate).toBe(2);
    expect(embedding.embedCallCount).toBe(callsAfterFirstIndex);
  });

  it('4. should store embeddings tagged with the active model', async () => {
    const db = await getDatabase();
    const result = await db.query(
      `SELECT COUNT(*)::int AS count,
              COUNT(DISTINCT "embedding_model")::int AS models,
              MIN("embedding_dim")::int AS dim
       FROM "note_embeddings" e
       JOIN "notes" n ON n.id = e.note_id
       WHERE n.user_id = $1;`,
      [userId]
    );

    const stats = (result.rows as any[])[0];
    expect(stats.count).toBeGreaterThan(0);
    expect(stats.models).toBe(1);
    expect(stats.dim).toBe(DIMENSIONS);
  });

  it('5. should retrieve the semantically matching note for a question', async () => {
    const res = await request(app)
      .post('/api/v1/rag/ask')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ question: 'How do I deploy with Kubernetes replicas?', topK: 3 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.question).toBe('How do I deploy with Kubernetes replicas?');
    expect(Array.isArray(data.retrievedNotes)).toBe(true);
    expect(data.retrievedNotes.length).toBeGreaterThan(0);

    // The Kubernetes note must outrank the sourdough note.
    expect(data.retrievedNotes[0].title).toBe('Kubernetes Deployment Guide');

    // Similarity is expressed as a percentage.
    expect(data.retrievedNotes[0].similarity).toBeGreaterThan(0);
    expect(data.retrievedNotes[0].similarity).toBeLessThanOrEqual(100);
  });

  it('6. should return a generated answer plus citable sources', async () => {
    const res = await request(app)
      .post('/api/v1/rag/ask')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ question: 'What is the bread recipe?', topK: 2 });

    expect(res.status).toBe(200);

    const data = res.body.data;
    expect(data.answer).toContain('Generated answer for');
    expect(Array.isArray(data.sources)).toBe(true);
    expect(data.sources.length).toBeGreaterThan(0);
    expect(data.sources[0]).toHaveProperty('index', 1);
    expect(data.sources[0]).toHaveProperty('noteId');
    expect(data.sources[0]).toHaveProperty('title');
  });

  it('7. should not leak notes belonging to other users', async () => {
    const other = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: `rag-other-${Date.now()}@notemind.ai`, password: 'SecurePassword123' });

    const res = await request(app)
      .post('/api/v1/rag/ask')
      .set('Authorization', `Bearer ${other.body.data.token}`)
      .send({ question: 'How do I deploy with Kubernetes replicas?', topK: 3 });

    expect(res.status).toBe(200);
    expect(res.body.data.retrievedNotes).toHaveLength(0);
    expect(res.body.data.answer).toBe("I couldn't find that in your notes.");
  });

  it('7b. should respect the collectionIds scope when searching', async () => {
    // A valid but non-existent collection id must yield zero matches.
    const res = await request(app)
      .post('/api/v1/rag/ask')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        question: 'How do I deploy with Kubernetes replicas?',
        topK: 3,
        collectionIds: ['11111111-2222-3333-4444-555555555555'],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.retrievedNotes).toHaveLength(0);
    expect(res.body.data.answer).toBe("I couldn't find that in your notes.");
  });

  it('7c. should respect the noteIds scope (Ask panel selection) when searching', async () => {
    // Tick only the bread note: the Kubernetes question must come back empty
    // even though the Kubernetes note is indexed.
    const scoped = await request(app)
      .post('/api/v1/rag/ask')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        question: 'How do I deploy with Kubernetes replicas?',
        topK: 3,
        noteIds: [breadNoteId],
      });

    expect(scoped.status).toBe(200);
    expect(scoped.body.data.retrievedNotes).toHaveLength(0);
    expect(scoped.body.data.answer).toBe("I couldn't find that in your notes.");

    // Tick the Kubernetes note instead: the same question now resolves.
    const allowed = await request(app)
      .post('/api/v1/rag/ask')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        question: 'How do I deploy with Kubernetes replicas?',
        topK: 3,
        noteIds: [kubernetesNoteId],
      });

    expect(allowed.status).toBe(200);
    expect(allowed.body.data.retrievedNotes.length).toBeGreaterThan(0);
    expect(allowed.body.data.retrievedNotes[0].title).toBe('Kubernetes Deployment Guide');
  });

  it('8. should degrade to keyword search when no embedding provider is configured', async () => {
    setEmbeddingProvider(null);
    setGenerationProvider(null);

    const res = await request(app)
      .post('/api/v1/rag/ask')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ question: 'Kubernetes', topK: 3 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.degraded).toBe(true);
    expect(Array.isArray(res.body.data.retrievedNotes)).toBe(true);
    expect(res.body.data.retrievedNotes.length).toBeGreaterThan(0);
    expect(res.body.data.retrievedNotes[0].title).toBe('Kubernetes Deployment Guide');
  });
});
