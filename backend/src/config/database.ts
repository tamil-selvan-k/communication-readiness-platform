import { Pool } from 'pg';
import { env } from './env';
import { pgConnectionConfig } from './pgConnection';

// Supabase pooler connections (port 6543 = transaction-mode) and remote
// Postgres connections need more time than the default 2 s budget.
export const db = new Pool({
  ...pgConnectionConfig(env.DATABASE_URL),
  max: 30,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

db.on('connect', () => {
  if (env.NODE_ENV === 'development') {
    console.log('[db] pool connected');
  }
});
