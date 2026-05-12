import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createPool } from './db/client.js';
import * as schema from './db/schema.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const pool = createPool(url);
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: join(__dirname, '../db/drizzle') });
  await pool.end();
  console.log('Migrations applied');
}

await main();
