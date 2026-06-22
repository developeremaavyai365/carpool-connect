import { Pool, type PoolClient } from 'pg';

let pool: Pool | null = null;

function buildDatabaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const password = process.env.SUPABASE_DB_PASSWORD;
  const ref = (process.env.SUPABASE_URL || '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!password || !ref) return null;

  const host = process.env.SUPABASE_DB_HOST || `db.${ref}.supabase.co`;
  const port = process.env.SUPABASE_DB_PORT || '5432';
  const user = process.env.SUPABASE_DB_USER || 'postgres';
  const db = process.env.SUPABASE_DB_NAME || 'postgres';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}

export function getPool(): Pool {
  if (pool) return pool;
  const url = buildDatabaseUrl();
  if (!url) {
    throw new Error('Postgres connection not configured (SUPABASE_DB_PASSWORD required for geospatial matching)');
  }
  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });
  return pool;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const { rows } = await getPool().query(text, params);
  return rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
