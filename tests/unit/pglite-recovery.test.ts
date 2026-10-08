import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getDatabase } from '../../src/db';

describe('PGlite database recovery', () => {
  it('should recover from a stale persisted data directory', async () => {
    const tempDir = path.join(os.tmpdir(), `notemind-pglite-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'postgresql.auto.conf'), 'this-is-not-a-valid-pglite-state');

    await expect(getDatabase(tempDir)).resolves.toBeDefined();

    const db = await getDatabase(tempDir);
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }, 30000);
});
