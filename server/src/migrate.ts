import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './infrastructure/db/createDatabase.js';
import { Logger } from './infrastructure/logging/Logger.js';
import { loadConfig } from './config/env.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const config = loadConfig();
  const logger = Logger.fromConfig(config);
  const { pool, db } = createDatabase(config.databaseUrl);
  await migrate(db, { migrationsFolder: join(__dirname, '../db/drizzle') });
  await pool.end();
  logger.info('Migrations applied');
}

await main();
