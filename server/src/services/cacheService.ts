/*
    Service: CacheService
    Description: Centralized Redis caching service with typed values, pattern invalidation, tags, and statistics
    Methods:
        - set(key, value, ttl): Promise<void> - Set typed value with TTL
        - get(key): Promise<T | null> - Get typed value
        - getOrSet(options, fetcher): Promise<T> - Get or fetch with auto-caching
        - del(key): Promise<void> - Delete single key
        - invalidatePattern(pattern): Promise<void> - Invalidate by pattern (trending:*)
        - invalidateTag(tag): Promise<void> - Invalidate by tag
        - flush(): Promise<void> - Clear all cache
        - getStats(): CacheStats - Get cache hit/miss statistics
    Usage:
        - Use getOrSet for most queries (handles caching automatically)
        - Use invalidateTag/invalidatePattern for batch invalidation
        - Use getStats to monitor cache performance
*/
import { createClient, RedisClientType } from 'redis';
import dotenv from 'dotenv';
import logger from './loggerService';
dotenv.config();

interface CacheOptions {
  key: string;
  ttl: number;
  staleIfError?: number;
  tags?: string[];
}

interface CacheStats {
  hits: number;
  misses: number;
  invalidations: number;
}

class CacheService {
    public redisClient: any;
    public cacheTime: number = Number(process.env.CACHETIME) || 3600;
    private stats: CacheStats = { hits: 0, misses: 0, invalidations: 0 };

    constructor() {
        this.redisClient = createClient({
            socket: {
                host: process.env.REDIS_HOST || '127.0.0.1',
                port: Number(process.env.REDIS_PORT) || 6379,
            },
            password: process.env.REDIS_PASS || undefined,
        })

        this.redisClient.connect().catch((err: string) => {
            logger.error(`Redis Connection Error: ${err}`, { service: 'cacheService' });
        });

        this.redisClient.on('error', (err: string) => {
            logger.error(`Redis Error: ${err}`, { service: 'cacheService' });
        });
    }

    /**
     * Set value in cache with optional tags for batch invalidation
     */
    public async set<T>(
        key: string,
        value: T,
        ttl: number = this.cacheTime,
        tags?: string[]
    ): Promise<void> {
        try {
            const serialized = JSON.stringify(value);
            await this.redisClient.set(key, serialized, { EX: ttl });

            // Store stale copy for error recovery
            const staleKey = `${key}:stale`;
            await this.redisClient.set(staleKey, serialized, { EX: ttl * 3 });
        } catch (error) {
            logger.error(`Error setting cache for key ${key}: ${error}`, { service: 'cacheService' });
        }
    }

    /**
     * Set raw string value (legacy support)
     */
    public async setRaw(key: string, value: string, ttl: number = this.cacheTime): Promise<void> {
        try {
            await this.redisClient.set(key, value, 'EX', ttl);
        } catch (error) {
            logger.error(`Error setting cache for key ${key}: ${error}`, { service: 'cacheService' });
        }
    }

    /**
     * Get typed value from cache
     */
    public async get<T>(key: string): Promise<T | null> {
        try {
            const reply = await this.redisClient.get(key);
            if (reply) {
                this.stats.hits++;
                return JSON.parse(reply);
            }
            this.stats.misses++;
            return null;
        } catch (error) {
            logger.error(`Error getting cache for key ${key}: ${error}`, { service: 'cacheService' });
            return null;
        }
    }

    /**
     * Get raw string value (legacy support)
     */
    public async getRaw(key: string): Promise<string | null> {
        try {
            const reply = await this.redisClient.get(key);
            if (reply) {
                this.stats.hits++;
                return reply;
            }
            this.stats.misses++;
            return null;
        } catch (error) {
            logger.error(`Error getting cache for key ${key}: ${error}`, { service: 'cacheService' });
            throw error;
        }
    }

    /**
     * Get cached value or fetch using provided function
     */
    public async getOrSet<T>(
        options: CacheOptions,
        fetcher: () => Promise<T>
    ): Promise<T> {
        try {
            // Try to get from cache
            const cached = await this.get<T>(options.key);
            if (cached !== null) {
                logger.debug(`Cache HIT: ${options.key}`, { service: 'cacheService' });
                return cached;
            }

            // Fetch fresh data
            const result = await fetcher();

            // Store in cache
            await this.set(options.key, result, options.ttl, options.tags);

            return result;
        } catch (error) {
            logger.error(`Cache getOrSet error for ${options.key}: ${error}`, {
                service: 'cacheService',
            });

            // Try to return stale data if configured
            if (options.staleIfError) {
                const staleKey = `${options.key}:stale`;
                const stale = await this.get<T>(staleKey);
                if (stale !== null) {
                    logger.warn(
                        `Returning stale data for ${options.key} due to fetch error`,
                        { service: 'cacheService' }
                    );
                    return stale;
                }
            }

            throw error;
        }
    }

    /**
     * Delete single cache entry
     */
    public async del(key: string): Promise<void> {
        try {
            await this.redisClient.del(key);
            await this.redisClient.del(`${key}:stale`);
            this.stats.invalidations++;
            logger.debug(`Cache invalidated: ${key}`, { service: 'cacheService' });
        } catch (error) {
            logger.error(`Error deleting cache for key ${key}: ${error}`, { service: 'cacheService' });
            throw error;
        }
    }

    /**
     * Invalidate cache by pattern
     */
    public async invalidatePattern(pattern: string): Promise<void> {
        try {
            // Redis v4+ KEYS command
            const keys = await this.redisClient.keys(pattern);
            if (keys && keys.length > 0) {
                const allKeys = keys.flatMap((k: string) => [k, `${k}:stale`]);
                await this.redisClient.del(allKeys);
                this.stats.invalidations += keys.length;
                logger.debug(
                    `Cache pattern invalidated: ${pattern} (${keys.length} keys)`,
                    { service: 'cacheService' }
                );
            }
        } catch (error) {
            logger.error(`Error invalidating cache pattern ${pattern}: ${error}`, { service: 'cacheService' });
        }
    }

    /**
     * Invalidate all keys with specific tag
     */
    public async invalidateTag(tag: string): Promise<void> {
        try {
            const tagKey = `tag:${tag}`;
            const taggedKeys = await this.redisClient.sMembers(tagKey);
            
            if (taggedKeys.length > 0) {
                for (const key of taggedKeys) {
                    await this.redisClient.del(key);
                    const staleKey = `${key}:stale`;
                    await this.redisClient.del(staleKey);
                }
                await this.redisClient.del(tagKey);
                this.stats.invalidations++;
                logger.debug(`Tag '${tag}' invalidated (${taggedKeys.length} keys)`, { service: 'cacheService' });
            }
        } catch (error) {
            logger.error(`Error invalidating cache tag ${tag}: ${error}`, { service: 'cacheService' });
        }
    }

    /**
     * Clear all cache
     */
    public async flush(): Promise<void> {
        try {
            await this.redisClient.flushall();
            this.stats = { hits: 0, misses: 0, invalidations: 0 };
            logger.warn(`Cache flushed (all data cleared)`, { service: 'cacheService' });
        } catch (error) {
            logger.error(`Error flushing cache: ${error}`, { service: 'cacheService' });
            throw error;
        }
    }

    /**
     * Get cache statistics
     */
    public getStats(): CacheStats & { hitRate: string } {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : 'N/A';
        
        return {
            ...this.stats,
            hitRate: `${hitRate}%`,
        };
    }

    /**
     * Reset cache statistics
     */
    public resetStats(): void {
        this.stats = { hits: 0, misses: 0, invalidations: 0 };
    }
}


export const cacheService = new CacheService();