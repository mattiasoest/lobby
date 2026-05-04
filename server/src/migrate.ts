import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url });
  const sqlPath = join(__dirname, '../db/migrations/001_init.sql');
  const sql = readFileSync(sqlPath, 'utf-8');
  await pool.query(sql);
  await pool.end();
  console.log('Migrations applied');
}

await main();
