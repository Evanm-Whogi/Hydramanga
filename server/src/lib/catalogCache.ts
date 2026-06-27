import { cacheService } from '@/services/cacheService';
import logger from '@/services/loggerService';

/** Persistent until MangaBaka metadata import; use 0 for no Redis expiry. */
export const CATALOG_CACHE_TTL = 0;

// Discover/search cache key prefixes. Bump the version when the cached payload shape
// changes. The read path (mangaController) AND invalidateCatalogCaches both derive their
// keys from these constants so the version can never drift out of sync again — a past bug
// left invalidation pinned to v6 while reads moved to v7, so the (TTL=0, never-expiring)
// cache was effectively impossible to clear.
export const DISCOVER_SEARCH_CACHE_PREFIX = 'manga:search:v9';
export const DISCOVER_SEARCH_COUNT_CACHE_PREFIX = 'manga:search:count:v9';

export async function invalidateCatalogCaches(): Promise<void> {
    await Promise.all([
        cacheService.invalidatePattern(`${DISCOVER_SEARCH_CACHE_PREFIX}:*`),
        cacheService.invalidatePattern(`${DISCOVER_SEARCH_COUNT_CACHE_PREFIX}:*`),
        cacheService.del('manga:tags:all'),
        cacheService.invalidatePattern('collections:genres:v*'),
    ]);
    logger.info('Catalog caches invalidated', { service: 'catalogCache' });
}
