/**
 * Connection settings for node-postgres that work with hosted PostgreSQL.
 *
 * pg 8.x lets an `sslmode` in the URL override the `ssl` option and treats
 * sslmode=require as verify-full, so Supabase / RDS connections fail with
 * "self-signed certificate in certificate chain". Hosted databases (and any URL
 * asking for require / verify-ca / no-verify, or DATABASE_SSL=true) get an
 * encrypted connection without CA verification — what libpq means by require.
 * sslmode=verify-full is left untouched for setups that ship their CA.
 */

const HOSTED_RE = /(supabase\.co|supabase\.com|rds\.amazonaws\.com|neon\.tech)$/i;
const UNVERIFIED_MODES = new Set(['require', 'verify-ca', 'no-verify']);

export interface PgConnectionConfig {
  connectionString: string;
  ssl?: { rejectUnauthorized: boolean };
}

export function pgConnectionConfig(connectionString: string): PgConnectionConfig {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return { connectionString };
  }
  const sslmode = url.searchParams.get('sslmode')?.toLowerCase() ?? null;
  if (sslmode === 'verify-full') return { connectionString };

  const wantsSsl = sslmode !== 'disable' && (
    process.env.DATABASE_SSL === 'true'
    || HOSTED_RE.test(url.hostname)
    || (sslmode !== null && UNVERIFIED_MODES.has(sslmode))
  );
  if (sslmode === null && !wantsSsl) return { connectionString };

  url.searchParams.delete('sslmode');
  return {
    connectionString: url.toString(),
    ...(wantsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}
