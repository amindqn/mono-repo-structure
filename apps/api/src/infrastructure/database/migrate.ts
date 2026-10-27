import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './connection.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required to run migrations');
const { db, pool } = createDatabase(url);
try {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
  });
  console.log('Migrations applied');
} finally {
  await pool.end();
}
