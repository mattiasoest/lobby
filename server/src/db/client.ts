import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString });
}

export type AppDatabase = NodePgDatabase<typeof schema>;

export function createDb(pool: pg.Pool): AppDatabase {
  return drizzle(pool, { schema });
}
