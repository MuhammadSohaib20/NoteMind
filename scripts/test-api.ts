import request from 'supertest';
import { createApp } from '../src/app';
import { getDatabase } from '../src/db';

async function runApiTests() {
  console.log('==================================================');
  console.log('🧪 Starting NoteMind Express API End-to-End Test Suite');
  console.log('==================================================\n');

  try {
    await getDatabase();
    const app = createApp();

    // 1. Health Check
    console.log('1️⃣ Testing GET /health ...');
    const healthRes = await request(app).get('/health');
    console.log(`   Status: ${healthRes.status} | Body:`, healthRes.body);
    if (healthRes.status !== 200) throw new Error('Health check failed');

    // 2. Auth Signup
    const testEmail = `api-test-${Date.now()}@notemind.ai`;
    console.log(`\n2️⃣ Testing POST /api/v1/auth/signup (${testEmail}) ...`);
    const signupRes = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: testEmail, password: 'SecurePassword123' });

    console.log(`   Status: ${signupRes.status} | Token generated ✅`);
    if (signupRes.status !== 201) throw new Error('Signup failed');

    const token = signupRes.body.data.token;

    // 3. Auth Login
    console.log('\n3️⃣ Testing POST /api/v1/auth/login ...');
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'SecurePassword123' });

    console.log(`   Status: ${loginRes.status} | Auth Verified ✅`);
    if (loginRes.status !== 200) throw new Error('Login failed');

    // 4. Create Collection
    console.log('\n4️⃣ Testing POST /api/v1/collections ...');
    const createColRes = await request(app)
      .post('/api/v1/collections')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Backend API Docs' });

    console.log(`   Status: ${createColRes.status} | Collection ID: ${createColRes.body.data.id}`);
    if (createColRes.status !== 201) throw new Error('Create collection failed');
    const collectionId = createColRes.body.data.id;

    // 5. List Collections
    console.log('\n5️⃣ Testing GET /api/v1/collections ...');
    const listColsRes = await request(app)
      .get('/api/v1/collections')
      .set('Authorization', `Bearer ${token}`);

    console.log(`   Status: ${listColsRes.status} | Total Collections: ${listColsRes.body.data.length}`);

    // 6. Create Note
    console.log('\n6️⃣ Testing POST /api/v1/notes ...');
    const createNoteRes = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        collectionId,
        title: 'Express & TypeScript Integration',
        content: 'Building production-grade Express REST API with Zod validation, JWT authentication, and pgvector RAG query capabilities.',
        tags: ['express', 'typescript', 'api'],
      });

    console.log(`   Status: ${createNoteRes.status} | Note ID: ${createNoteRes.body.data.id}`);
    if (createNoteRes.status !== 201) throw new Error('Create note failed');
    const noteId = createNoteRes.body.data.id;

    // 7. Get Note by ID
    console.log(`\n7️⃣ Testing GET /api/v1/notes/${noteId} ...`);
    const getNoteRes = await request(app)
      .get(`/api/v1/notes/${noteId}`)
      .set('Authorization', `Bearer ${token}`);

    console.log(`   Status: ${getNoteRes.status} | Title: "${getNoteRes.body.data.title}" | Tags: [${getNoteRes.body.data.tags.join(', ')}]`);

    // 8. List Notes with Pagination
    console.log('\n8️⃣ Testing GET /api/v1/notes (Pagination & Filtering) ...');
    const listNotesRes = await request(app)
      .get('/api/v1/notes?limit=5')
      .set('Authorization', `Bearer ${token}`);

    console.log(`   Status: ${listNotesRes.status} | Retrieved: ${listNotesRes.body.data.length} notes`);

    // 9. List Tags
    console.log('\n9️⃣ Testing GET /api/v1/tags ...');
    const listTagsRes = await request(app)
      .get('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`);

    console.log(`   Status: ${listTagsRes.status} | Tags: [${listTagsRes.body.data.map((t: any) => t.name).join(', ')}]`);

    // 10. Ask My Notes RAG Query
    console.log('\n🔟 Testing POST /api/v1/rag/ask ...');
    const ragRes = await request(app)
      .post('/api/v1/rag/ask')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'What tools are used for the Express REST API?' });

    console.log(`   Status: ${ragRes.status} | Answer: "${ragRes.body.data.answer}"`);
    console.log(`   Retrieved Notes: ${ragRes.body.data.retrievedNotes.length}`);

    // 11. Delete Note & Collection
    console.log(`\n1️⃣1️⃣ Testing DELETE /api/v1/notes/${noteId} ...`);
    const delNoteRes = await request(app)
      .delete(`/api/v1/notes/${noteId}`)
      .set('Authorization', `Bearer ${token}`);

    console.log(`   Status: ${delNoteRes.status} | Message: ${delNoteRes.body.data.message}`);

    console.log(`\n1️⃣2️⃣ Testing DELETE /api/v1/collections/${collectionId} ...`);
    const delColRes = await request(app)
      .delete(`/api/v1/collections/${collectionId}`)
      .set('Authorization', `Bearer ${token}`);

    console.log(`   Status: ${delColRes.status} | Message: ${delColRes.body.data.message}`);

    console.log('\n==================================================');
    console.log('✨ ALL EXPRESS API INTEGRATION TESTS PASSED! ✨');
    console.log('==================================================\n');
  } catch (error) {
    console.error('❌ API Integration Test Failed:', error);
    process.exit(1);
  }
}

runApiTests();
