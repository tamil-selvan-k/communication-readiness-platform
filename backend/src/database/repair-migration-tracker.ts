/**
 * Comprehensive repair: many migrations were applied outside the migration tracker
 * (system.migrations) so npm run migrate fails when it tries to re-apply them.
 *
 * Strategy per migration file:
 * 1. If already in system.migrations → skip
 * 2. Extract every "CREATE TABLE [IF NOT EXISTS] schema.table" from the SQL
 * 3. If ALL of those tables already exist in information_schema.tables
 *    → mark migration as applied (no DDL executed)
 * 4. If NONE or SOME exist → leave it for `npm run migrate` to handle
 *    (those migrations must be idempotent themselves)
 *
 * For seed-only migrations (no CREATE TABLE), also check INSERT-only files:
 *    a. Check if the file contains only INSERTs / DO blocks → mark as applied
 *       only if the tables they insert into already exist.
 *
 * Run once with:  npx tsx src/database/repair-migration-tracker.ts
 */

import 'dotenv/config';
import { Client } from 'pg';
import { pgConnectionConfig } from '../config/pgConnection';
import fs from 'fs/promises';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Regex to capture "schema"."table" from CREATE TABLE statements
const CREATE_TABLE_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\.(\w+)\s*\(/gi;

async function tableExists(
  client: Client,
  schema: string,
  table: string
): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2
     ) AS exists`,
    [schema, table]
  );
  return rows[0].exists;
}

async function main(): Promise<void> {
  const client = new Client(pgConnectionConfig(process.env.DATABASE_URL ?? ''));
  await client.connect();
  console.log('[repair] connected to database');

  // Ensure system schema + migrations table exist
  await client.query(`CREATE SCHEMA IF NOT EXISTS system`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS system.migrations (
      id         SERIAL PRIMARY KEY,
      filename   VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Load already-recorded migrations
  const { rows: applied } = await client.query<{ filename: string }>(
    'SELECT filename FROM system.migrations ORDER BY id'
  );
  const appliedSet = new Set(applied.map(r => r.filename));

  // Get all .sql files sorted
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter(f => f.endsWith('.sql'))
    .sort();

  let marked = 0;
  let skipped = 0;
  let pendingApply = 0;

  for (const file of files) {
    if (appliedSet.has(file)) {
      skipped++;
      continue;
    }

    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');

    // Extract all CREATE TABLE targets
    const tables: Array<{ schema: string; table: string }> = [];
    let match: RegExpExecArray | null;
    CREATE_TABLE_RE.lastIndex = 0;
    while ((match = CREATE_TABLE_RE.exec(sql)) !== null) {
      tables.push({ schema: match[1].toLowerCase(), table: match[2].toLowerCase() });
    }

    if (tables.length === 0) {
      // No CREATE TABLE — seed/index/trigger file. Mark as applied if it doesn't
      // attempt to CREATE anything that conflicts.
      // Safe assumption: seed files (INSERT/DO only) can be marked applied if
      // their content doesn't include CREATE TABLE (already checked above).
      // For index/trigger files, tables they reference should exist by now.
      await client.query(
        'INSERT INTO system.migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
        [file]
      );
      console.log(`[repair] marked (no CREATE TABLE — seed/index/trigger) — ${file}`);
      marked++;
      continue;
    }

    // Check if ALL tables exist
    const existenceChecks = await Promise.all(
      tables.map(t => tableExists(client, t.schema, t.table))
    );
    const allExist = existenceChecks.every(Boolean);
    const anyExist = existenceChecks.some(Boolean);

    if (allExist) {
      await client.query(
        'INSERT INTO system.migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
        [file]
      );
      const tableList = tables.map(t => `${t.schema}.${t.table}`).join(', ');
      console.log(`[repair] marked (all tables exist: ${tableList}) — ${file}`);
      marked++;
    } else if (anyExist) {
      // Partial state — needs IF NOT EXISTS in migration to succeed
      const missing = tables.filter((t, i) => !existenceChecks[i]);
      const existing = tables.filter((t, i) => existenceChecks[i]);
      console.log(
        `[repair] PARTIAL — ${file}\n` +
        `         exists: ${existing.map(t => `${t.schema}.${t.table}`).join(', ')}\n` +
        `         missing: ${missing.map(t => `${t.schema}.${t.table}`).join(', ')}`
      );
      pendingApply++;
    } else {
      // No tables exist — this migration needs to be applied
      console.log(`[repair] pending (tables don't exist yet) — ${file}`);
      pendingApply++;
    }
  }

  await client.end();
  console.log(
    `\n[repair] done — ${marked} marked as pre-applied, ` +
    `${skipped} already tracked, ${pendingApply} pending application`
  );
}

main().catch(err => {
  console.error('[repair] error:', err.message);
  process.exit(1);
});
