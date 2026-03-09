import { createDb, ensureSchema } from './packages/db/dist/client.js';
import * as schema from './packages/db/dist/index.js';
import { randomUUID } from 'crypto';
import { unlinkSync } from 'fs';

const dbPath = '/tmp/test-smoke-' + Date.now() + '.sqlite';

try {
  const db = createDb(dbPath);
  console.log('✅ DB created:', dbPath);

  // Create all tables
  ensureSchema(db);
  console.log('✅ Schema applied');

  const { companies, agents } = schema;

  // Insert a test company
  const companyId = randomUUID();
  db.insert(companies).values({
    id: companyId,
    name: 'Smoke Test Corp',
    slug: 'smoke-test',
  }).run();
  console.log('✅ Inserted company:', companyId);

  // Query it back
  const found = db.select().from(companies).all();
  console.log('Companies:', found.length, '- name:', found[0]?.name);

  // Insert an agent
  const agentId = randomUUID();
  db.insert(agents).values({
    id: agentId,
    companyId,
    name: 'CEO Bot',
    role: 'ceo',
    status: 'active',
    adapterType: 'openclaw',
    adapterConfig: JSON.stringify({ gatewayToken: 'test' }),
    runtimeConfig: JSON.stringify({}),
    permissions: JSON.stringify({}),
  }).run();
  console.log('✅ Inserted agent:', agentId);

  const foundAgents = db.select().from(agents).all();
  console.log('Agents:', foundAgents.length, '- name:', foundAgents[0]?.name);

  console.log('\n🎉 Smoke test PASSED');
} catch (e) {
  console.error('❌ Smoke test FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
} finally {
  try { unlinkSync(dbPath); } catch {}
}
