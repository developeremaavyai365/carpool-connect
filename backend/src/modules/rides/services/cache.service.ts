/**
 * Redis cache with in-memory fallback when REDIS_URL is not set.
 */
type CacheEntry = { value: string; expiresAt: number };

class MemoryCache {
  private store = new Map<string, CacheEntry>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }

  async delPattern(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}

export class CacheService {
  private memory = new MemoryCache();
  private redis: import('ioredis').default | null = null;
  private redisReady = false;

  constructor() {
    this.initRedis().catch(() => {});
  }

  private async initRedis(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) return;
    try {
      const Redis = (await import('ioredis')).default;
      this.redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
      await this.redis.connect();
      this.redisReady = true;
      console.log('[CacheService] Redis connected');
    } catch (err) {
      console.warn('[CacheService] Redis unavailable, using memory cache:', (err as Error).message);
      this.redis = null;
    }
  }

  searchKey(params: {
    pickup_lat: number;
    pickup_lng: number;
    drop_lat: number;
    drop_lng: number;
    date?: string;
  }): string {
    const r = (n: number) => n.toFixed(3);
    const { MATCHING_RADIUS_KM } = require('../config/constants') as { MATCHING_RADIUS_KM: number };
    return `rides:search:r${MATCHING_RADIUS_KM}:${r(params.pickup_lat)},${r(params.pickup_lng)}:${r(params.drop_lat)},${r(params.drop_lng)}:${params.date || 'any'}`;
  }

  activeTripsKey = 'rides:active';

  async get<T>(key: string): Promise<T | null> {
    const raw = this.redisReady && this.redis
      ? await this.redis.get(key)
      : await this.memory.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSec: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (this.redisReady && this.redis) {
      await this.redis.setex(key, ttlSec, raw);
    } else {
      await this.memory.set(key, raw, ttlSec);
    }
  }

  async invalidateSearch(): Promise<void> {
    if (this.redisReady && this.redis) {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', 'rides:search:*', 'COUNT', 100);
        cursor = next;
        if (keys.length) await this.redis.del(...keys);
      } while (cursor !== '0');
    } else {
      await this.memory.delPattern('rides:search:');
    }
  }

  async invalidateActiveTrips(): Promise<void> {
    if (this.redisReady && this.redis) {
      await this.redis.del(this.activeTripsKey);
    } else {
      await this.memory.delPattern('rides:active');
    }
  }
}

export const cacheService = new CacheService();
