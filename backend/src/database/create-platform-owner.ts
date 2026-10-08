/**
 * Creates (or resets the password of) a PLATFORM_OWNER account.
 * Deliberately not a migration: a seeded owner would ship a known password.
 *
 *   npm run create-owner -- owner@example.com "Owner Name"
 *
 * Prints a generated password once; set OWNER_PASSWORD to choose it instead.
 */

import 'dotenv/config';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { pgConnectionConfig } from '../config/pgConnection';

async function main(): Promise<void> {
  const [emailArg, ...nameParts] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) {
    console.error('Usage: npm run create-owner -- <email> "<full name>"');
    process.exit(1);
  }
  const name = nameParts.join(' ').trim() || 'Platform Owner';
  const password = process.env.OWNER_PASSWORD || crypto.randomBytes(12).toString('base64url');
  if (password.length < 8) {
    console.error('OWNER_PASSWORD must be at least 8 characters');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 10);

  const client = new Client(pgConnectionConfig(process.env.DATABASE_URL ?? ''));
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string; role: string }>(
      'SELECT id, role FROM identity.users WHERE email = $1',
      [email]
    );
    if (rows.length > 0 && rows[0].role !== 'PLATFORM_OWNER') {
      console.error(`${email} already exists as ${rows[0].role}; refusing to change it into an owner.`);
      process.exit(1);
    }
    if (rows.length > 0) {
      await client.query(
        `UPDATE identity.users
         SET password_hash = $1, token_version = token_version + 1, status = 'ACTIVE', is_active = true, updated_at = now()
         WHERE id = $2`,
        [passwordHash, rows[0].id]
      );
      console.log(`Password reset for platform owner ${email}`);
    } else {
      await client.query(
        `INSERT INTO identity.users (name, email, password_hash, role, status)
         VALUES ($1, $2, $3, 'PLATFORM_OWNER', 'ACTIVE')`,
        [name, email, passwordHash]
      );
      console.log(`Created platform owner ${email}`);
    }
    if (!process.env.OWNER_PASSWORD) console.log(`Password: ${password}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
