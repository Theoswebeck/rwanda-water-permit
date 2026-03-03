/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require('pg');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ Missing DATABASE_URL environment variable');
  process.exit(1);
}

const db = new Client({ connectionString: dbUrl });

async function testAuth() {
  console.log('🔍 Testing self-hosted PostgreSQL connection...');

  try {
    await db.connect();
    const users = await db.query('select count(*)::int as count from public.users');
    const apps = await db.query('select count(*)::int as count from public.applications');
    console.log('✅ DB connected');
    console.log(`Users: ${users.rows[0].count}`);
    console.log(`Applications: ${apps.rows[0].count}`);

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await db.end().catch(() => null);
  }
}

testAuth().then(() => {
  console.log('\n📝 Self-hosted auth/database smoke test completed.');
  process.exit(0);
});
