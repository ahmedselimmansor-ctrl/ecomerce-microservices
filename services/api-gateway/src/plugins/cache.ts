import { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    cache: CacheApi;
  }
}

export interface CacheApi {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(pattern: string): Promise<void>;
  /** يمنع انهيار الكاش (stampede): طلب واحد فقط يعيد البناء. */
  getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T>;
}

async function plugin(app: FastifyInstance): Promise<void> {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    connectTimeout: 1_000,
    lazyConnect: false,
    retryStrategy: (times: number) => Math.min(times * 200, 3_000),
  });

  redis.on('error', (err: unknown) => app.log.warn({ err }, 'redis error'));
  redis.on('connect', () => app.log.info('redis connected'));

  const inFlight = new Map<string, Promise<unknown>>();

  const cache: CacheApi = {
    async get<T>(key: string): Promise<T | null> {
      try {
        const raw = await redis.get(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch (err) {
        // الكاش تحسين لا شرط — سقوطه يعني بطء لا تعطّل
        app.log.warn({ err, key }, 'cache read failed');
        return null;
      }
    },

    async set(key, value, ttlSeconds) {
      try {
        await redis.setex(key, ttlSeconds, JSON.stringify(value));
      } catch (err) {
        app.log.warn({ err, key }, 'cache write failed');
      }
    },

    async del(pattern) {
      try {
        if (!pattern.includes('*')) {
          await redis.del(pattern);
          return;
        }
        // SCAN لا KEYS: KEYS تحجب Redis بالكامل على قاعدة إنتاجية كبيرة
        let cursor = '0';
        do {
          const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
          cursor = next;
          if (keys.length > 0) await redis.unlink(...keys);
        } while (cursor !== '0');
      } catch (err) {
        app.log.warn({ err, pattern }, 'cache invalidation failed');
      }
    },

    async getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
      const cached = await cache.get<T>(key);
      if (cached !== null) return cached;

      // single-flight داخل هذه النسخة: عشرة طلبات متزامنة ⇒ نداء خلفي واحد
      const pending = inFlight.get(key);
      if (pending) return pending as Promise<T>;

      const promise = (async () => {
        try {
          const fresh = await loader();
          await cache.set(key, fresh, ttlSeconds);
          return fresh;
        } finally {
          inFlight.delete(key);
        }
      })();

      inFlight.set(key, promise);
      return promise;
    },
  };

  app.decorate('redis', redis);
  app.decorate('cache', cache);

  app.addHook('onClose', async () => {
    await redis.quit().catch(() => redis.disconnect());
  });
}

/** بلا `fastify-plugin` يبقى `app.redis` غير معرّف خارج هذه الإضافة. */
export const cachePlugin = fp(plugin, { name: 'topchoice-cache' });
