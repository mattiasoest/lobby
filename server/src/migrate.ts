import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './infrastructure/db/createDatabase.js';
import { loadConfig } from './config/env.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const config = loadConfig();
  const { pool, db } = createDatabase(config.databaseUrl);
  await migrate(db, { migrationsFolder: join(__dirname, '../db/drizzle') });
  await pool.end();
  console.log('Migrations applied');
}

await main();
