import http from 'http';
import jwt from 'jsonwebtoken';
import '../../src/config/env';

interface BenchmarkMetric {
  endpoint: string;
  method: string;
  count: number;
  errors: number;
  latencies: number[];
}

const BASE_URL = process.env.TARGET_URL || 'http://127.0.0.1:3000';
const JWT_SECRET = process.env.JWT_SECRET || '3def721749e6a2a0873842b2f23a2dc251e69d89cd7e86caed93f85f5f38cb2ae890a41d580d24ab298c0c1a1c410ec1';

async function request(url: string, options: any = {}): Promise<{ status: number; durationMs: number; data: any }> {
  const start = Date.now();
  const res = await fetch(url, options);
  const durationMs = Date.now() - start;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response
  }
  return { status: res.status, durationMs, data };
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function runLoadBenchmark() {
  console.log('====================================================');
  console.log('🚀 NoteMind k6-Equivalent Native Load Test Suite');
  console.log(`🎯 Target Base URL: ${BASE_URL}`);
  console.log('====================================================\n');

  const metrics: Record<string, BenchmarkMetric> = {
    health: { endpoint: '/health', method: 'GET', count: 0, errors: 0, latencies: [] },
    authRateLimit: { endpoint: '/api/v1/auth/login', method: 'POST', count: 0, errors: 0, latencies: [] },
    notesList: { endpoint: '/api/v1/notes', method: 'GET', count: 0, errors: 0, latencies: [] },
    notesCreate: { endpoint: '/api/v1/notes', method: 'POST', count: 0, errors: 0, latencies: [] },
    ragAsk: { endpoint: '/api/v1/rag/ask', method: 'POST', count: 0, errors: 0, latencies: [] },
  };

  // 1. Healthcheck baseline test (25 requests)
  console.log('▶ Stage 1: Probing Healthcheck & Connection Pool (/health)...');
  for (let i = 0; i < 25; i++) {
    const res = await request(`${BASE_URL}/health`);
    metrics.health.count++;
    metrics.health.latencies.push(res.durationMs);
    if (res.status !== 200) metrics.health.errors++;
  }
  console.log(`   Done 25 health checks. Avg: ${(metrics.health.latencies.reduce((a, b) => a + b, 0) / 25).toFixed(1)}ms`);

  // 2. Auth Endpoint Stress & Rate Limiting Verification (10 requests)
  console.log('▶ Stage 2: Stress Testing Authentication & Rate Limiter Shield...');
  for (let i = 0; i < 10; i++) {
    const res = await request(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `stress_${i}@notemind.test`, password: 'TestPassword123' }),
    });
    metrics.authRateLimit.count++;
    metrics.authRateLimit.latencies.push(res.durationMs);
    // Under rate limiting, HTTP 429 or 401 is considered correct defense
    if (res.status !== 401 && res.status !== 429) metrics.authRateLimit.errors++;
  }
  console.log(`   Done 10 auth requests. Avg: ${(metrics.authRateLimit.latencies.reduce((a, b) => a + b, 0) / 10).toFixed(1)}ms`);

  // Mint simulated authentic JWT token for heavy API load stages
  const testUserId = '0a0117c0-bc3d-4188-af8e-01e46beef37d'; // Existing verified active user
  const authToken = jwt.sign({ id: testUserId, email: 'verification_admin@notemind.internal' }, JWT_SECRET, { expiresIn: '1h' });

  const authHeader = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
  };

  // 3. Notes CRUD & Listing (20 requests)
  console.log('▶ Stage 3: Load Testing Note Creation and Paginated Retrieval...');
  for (let i = 0; i < 15; i++) {
    const createRes = await request(`${BASE_URL}/api/v1/notes`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({
        title: `Load Test Note #${i}`,
        content: `Simulated load test note content verifying transaction speed and auto-indexing queue at index ${i}.`,
      }),
    });
    metrics.notesCreate.count++;
    metrics.notesCreate.latencies.push(createRes.durationMs);
    if (createRes.status !== 201) metrics.notesCreate.errors++;

    const listRes = await request(`${BASE_URL}/api/v1/notes?limit=10`, {
      headers: authHeader,
    });
    metrics.notesList.count++;
    metrics.notesList.latencies.push(listRes.durationMs);
    if (listRes.status !== 200) metrics.notesList.errors++;
  }
  console.log(`   Done note operations. List Avg: ${(metrics.notesList.latencies.reduce((a, b) => a + b, 0) / metrics.notesList.count).toFixed(1)}ms`);

  // 4. Vector RAG Q&A similarity queries (3 requests with AI generation)
  console.log('▶ Stage 4: Testing Vector Cosine Similarity Search & RAG (/api/v1/rag/ask)...');
  for (let i = 0; i < 3; i++) {
    const ragRes = await request(`${BASE_URL}/api/v1/rag/ask`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({
        question: 'What is the connection pooling and RAG architecture?',
        topK: 3,
      }),
    });
    metrics.ragAsk.count++;
    metrics.ragAsk.latencies.push(ragRes.durationMs);
    if (ragRes.status !== 200 && ragRes.status !== 429) metrics.ragAsk.errors++;
  }
  console.log(`   Done RAG queries. Avg: ${(metrics.ragAsk.latencies.reduce((a, b) => a + b, 0) / metrics.ragAsk.count).toFixed(1)}ms`);

  // Summary Table
  console.log('\n====================================================');
  console.log('📊 PERFORMANCE & LOAD TEST RESULTS BENCHMARK TABLE');
  console.log('====================================================');
  console.log('| Endpoint                     | Method | Requests | Error Rate | p50 (ms) | p95 (ms) | p99 (ms) | Status |');
  console.log('|------------------------------|--------|----------|------------|----------|----------|----------|--------|');

  for (const [key, m] of Object.entries(metrics)) {
    const errorPct = ((m.errors / m.count) * 100).toFixed(1);
    const p50 = percentile(m.latencies, 50);
    const p95 = percentile(m.latencies, 95);
    const p99 = percentile(m.latencies, 99);
    const status = m.errors === 0 ? '✅ PASS' : Number(errorPct) < 5 ? '⚠️ SLOW' : '❌ FAIL';

    const ep = (m.endpoint + '                            ').slice(0, 28);
    const meth = (m.method + '    ').slice(0, 6);
    const reqs = (m.count + '        ').slice(0, 8);
    const err = (errorPct + '%         ').slice(0, 10);
    const p50Str = (p50 + 'ms        ').slice(0, 8);
    const p95Str = (p95 + 'ms        ').slice(0, 8);
    const p99Str = (p99 + 'ms        ').slice(0, 8);

    console.log(`| ${ep} | ${meth} | ${reqs} | ${err} | ${p50Str} | ${p95Str} | ${p99Str} | ${status} |`);
  }
  console.log('====================================================\n');
}

runLoadBenchmark().catch(console.error);
