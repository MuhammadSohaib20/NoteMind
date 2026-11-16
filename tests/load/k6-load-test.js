import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Custom metrics
const healthLatency = new Trend('health_latency_ms');
const authLatency = new Trend('auth_latency_ms');
const notesListLatency = new Trend('notes_list_latency_ms');
const ragAskLatency = new Trend('rag_ask_latency_ms');
const errorRate = new Rate('api_error_rate');
const successfulRequests = new Counter('successful_requests');

export const options = {
  stages: [
    { duration: '15s', target: 10 }, // Ramp-up to 10 concurrent users
    { duration: '30s', target: 25 }, // Steady load with 25 VUs
    { duration: '15s', target: 50 }, // Stress spike to 50 VUs
    { duration: '10s', target: 0 },  // Ramp-down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<600', 'p(99)<1500'], // 95% of requests < 600ms
    api_error_rate: ['rate<0.02'],                  // Less than 2% errors allowed
    health_latency_ms: ['p(95)<150'],              // Health probe must stay fast (<150ms)
    notes_list_latency_ms: ['p(95)<400'],          // Paginated queries under 400ms
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3000';

export default function () {
  // 1. Healthcheck & Database Connection Check
  group('01_Healthcheck', () => {
    const res = http.get(`${BASE_URL}/health`);
    const isOk = check(res, {
      'health status 200': (r) => r.status === 200,
      'db status ok': (r) => {
        try {
          return JSON.parse(r.body).database === 'ok';
        } catch {
          return false;
        }
      },
    });

    healthLatency.add(res.timings.duration);
    if (!isOk) errorRate.add(1);
    else successfulRequests.add(1);
  });

  sleep(0.5);

  // 2. User Authentication (Signup / Login)
  let authToken = '';
  const testEmail = `loadtest_${__VU}_${Date.now()}@notemind.internal`;
  const testPassword = 'Password123!Secure';

  group('02_Authentication', () => {
    const signupPayload = JSON.stringify({
      email: testEmail,
      password: testPassword,
    });

    const signupRes = http.post(`${BASE_URL}/api/v1/auth/signup`, signupPayload, {
      headers: { 'Content-Type': 'application/json' },
    });

    const signupOk = check(signupRes, {
      'signup status 201': (r) => r.status === 201,
      'token received': (r) => {
        try {
          const body = JSON.parse(r.body);
          if (body.data?.token) {
            authToken = body.data.token;
            return true;
          }
          return false;
        } catch {
          return false;
        }
      },
    });

    authLatency.add(signupRes.timings.duration);
    if (!signupOk) {
      errorRate.add(1);
    } else {
      successfulRequests.add(1);
    }
  });

  if (!authToken) {
    sleep(1);
    return;
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
  };

  sleep(0.5);

  // 3. Notes CRUD & Listing with Cursor Pagination
  group('03_Notes_Listing', () => {
    // Create a note under load
    const createPayload = JSON.stringify({
      title: `Load Test Note VU ${__VU}`,
      content: `Performance load testing content generated at ${new Date().toISOString()} for NoteMind vector evaluation.`,
    });

    const createRes = http.post(`${BASE_URL}/api/v1/notes`, createPayload, {
      headers: authHeaders,
    });

    check(createRes, {
      'note created 201': (r) => r.status === 201,
    });

    // Fetch notes list (cursor pagination & relations)
    const listRes = http.get(`${BASE_URL}/api/v1/notes?limit=10`, {
      headers: authHeaders,
    });

    const listOk = check(listRes, {
      'notes list 200': (r) => r.status === 200,
      'notes array returned': (r) => {
        try {
          return Array.isArray(JSON.parse(r.body).data?.notes);
        } catch {
          return false;
        }
      },
    });

    notesListLatency.add(listRes.timings.duration);
    if (!listOk) errorRate.add(1);
    else successfulRequests.add(1);
  });

  sleep(0.5);

  // 4. RAG Vector Search & Ask Endpoint
  group('04_Vector_RAG_Ask', () => {
    const ragPayload = JSON.stringify({
      question: 'What is the performance and scaling strategy for NoteMind?',
      topK: 3,
    });

    const ragRes = http.post(`${BASE_URL}/api/v1/rag/ask`, ragPayload, {
      headers: authHeaders,
    });

    const ragOk = check(ragRes, {
      'rag response received': (r) => r.status === 200 || r.status === 429, // 429 is rate-limited (graceful handling)
    });

    ragAskLatency.add(ragRes.timings.duration);
    if (!ragOk) errorRate.add(1);
    else successfulRequests.add(1);
  });

  sleep(1);
}
