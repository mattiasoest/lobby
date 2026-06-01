import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type AppDatabase = NodePgDatabase<typeof schema>;

export function createDatabase(connectionString: string): { pool: pg.Pool; db: AppDatabase } {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { pool, db };
}
