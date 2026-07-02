import Redis from 'ioredis';
import { env } from './env';

// Try to create a Redis client. If unavailable, we'll operate in fallback mode
// (in-memory Map) so the rest of the app still works for local dev / tests.

let client: Redis | null = null;
let available = false;

try {
  if (env.REDIS_URL) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: 1500,
    });

    client.on('error', (err) => {
      if (available) {
        console.warn('Redis connection error - falling back to in-memory store:', err.message);
      }
      available = false;
    });

    client.connect().then(() => {
      available = true;
      console.log('Redis connected');
    }).catch((err) => {
      console.warn('Redis not available - using in-memory fallback:', err.message);
      available = false;
      client = null;
    });
  } else {
    console.log('REDIS_URL not set - using in-memory store for tokens/rate-limit');
  }
} catch (err) {
  console.warn('Redis init failed - using in-memory fallback:', err);
  client = null;
}

export const redis = {
  isAvailable: () => available && client !== null,
  set: async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
    if (available && client) {
      if (ttlSeconds) await client.set(key, value, 'EX', ttlSeconds);
      else await client.set(key, value);
    } else {
      memoryStore.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
    }
  },
  get: async (key: string): Promise<string | null> => {
    if (available && client) {
      return await client.get(key);
    }
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      memoryStore.delete(key);
      return null;
    }
    return entry.value;
  },
  del: async (key: string): Promise<void> => {
    if (available && client) {
      await client.del(key);
    } else {
      memoryStore.delete(key);
    }
  },
  // For rate-limit-redis integration
  raw: () => client,
};

// Simple in-memory fallback
interface MemoryEntry { value: string; expiresAt: number | null }
const memoryStore = new Map<string, MemoryEntry>();

// Periodic cleanup for memory store
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAt && entry.expiresAt < now) memoryStore.delete(key);
  }
}, 60_000).unref();
