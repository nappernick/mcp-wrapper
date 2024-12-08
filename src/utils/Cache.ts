// src/utils/Cache.ts
import NodeCache from 'node-cache';
import logger from './Logger';

class Cache {
  private cache: NodeCache;

  constructor(ttlSeconds: number) {
    this.cache = new NodeCache({ stdTTL: ttlSeconds, checkperiod: ttlSeconds * 0.2, useClones: false });
  }

  get<T>(key: string): T | undefined {
    const value = this.cache.get<T>(key);
    if (value) {
      logger.info(`Cache hit for key: ${key}`);
    } else {
      logger.info(`Cache miss for key: ${key}`);
    }
    return value;
  }

  set<T>(key: string, value: T): void {
    this.cache.set(key, value);
    logger.info(`Cache set for key: ${key}`);
  }
}

export default Cache;