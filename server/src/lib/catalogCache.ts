import { cacheService } from '@/services/cacheService';
import logger from '@/services/loggerService';

/** Persistent until MangaBaka metadata import; use 0 for no Redis expiry. */
export const CATALOG_CACHE_TTL = 0;

export async function invalidateCatalogCaches(): Promise<void> {
    await Promise.all([
        cacheService.invalidatePattern('manga:search:v3:*'),
        cacheService.invalidatePattern('manga:search:count:v3:*'),
        cacheService.del('manga:tags:all'),
        cacheService.del('collections:genres:v2'),
    ]);
    logger.info('Catalog caches invalidated after metadata import', { service: 'catalogCache' });
}
