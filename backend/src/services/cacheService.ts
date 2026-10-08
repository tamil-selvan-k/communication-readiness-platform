import { createClient } from 'redis';
import { env } from '../config/env';

type RedisClient = ReturnType<typeof createClient>;

let _client: RedisClient | null = null;
let _connectPromise: Promise<unknown> | null = null;

async function getClient(): Promise<RedisClient> {
  // Caching is optional. Without REDIS_URL, fail fast so every call degrades to a
  // cache miss — a connect attempt to a missing server never settles and hangs the request.
  if (!env.REDIS_URL) throw new Error('Redis not configured');
  if (_client?.isReady) return _client;
  if (_connectPromise) {
    await _connectPromise;
    if (_client?.isReady) return _client!;
  }
  _client = createClient({ url: env.REDIS_URL });
  _client.on('error', () => {
    _client = null;
    _connectPromise = null;
  });
  _connectPromise = _client.connect().catch((err) => {
    _client = null;
    _connectPromise = null;
    throw err;
  });
  await _connectPromise;
  return _client!;
}

async function get<T>(key: string): Promise<T | null> {
  try {
    const client = await getClient();
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    const client = await getClient();
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch {
    // non-fatal: cache write failure degrades to DB read
  }
}

async function del(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    const client = await getClient();
    await client.del(keys);
  } catch {
    // non-fatal
  }
}

async function delPattern(pattern: string): Promise<void> {
  try {
    const client = await getClient();
    let cursor = 0;
    do {
      const reply = await client.scan(cursor as any, { MATCH: pattern, COUNT: 100 });
      cursor = Number(reply.cursor);
      if (reply.keys.length > 0) await client.del(reply.keys);
    } while (cursor !== 0);
  } catch {
    // non-fatal
  }
}

export const cache = { get, set, del, delPattern };
