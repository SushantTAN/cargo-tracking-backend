import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../config/redis';

const makeStore = (prefix: string): any | undefined => {
  if (redis.isAvailable() && redis.raw()) {
    const client = redis.raw()!;
    return new RedisStore({
      // rate-limit-redis expects: sendCommand: (...args: string[]) => Promise<RedisReply>
      sendCommand: (...args: string[]) => client.call(args[0], ...args.slice(1)) as Promise<any>,
      prefix: `rl:${prefix}:`,
    });
  }
  return undefined; // falls back to default in-memory store
};

export const generalLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
  store: makeStore('general'),
});

export const authLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts, please try again later.' },
  store: makeStore('auth'),
});

export const trackingLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many tracking requests, please try again later.' },
  store: makeStore('tracking'),
});
