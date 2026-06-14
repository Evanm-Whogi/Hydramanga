/**
 * Application Configuration Service
 * 
 * Centralized, typed configuration management for the entire application.
 * Consolidates scattered environment variables and hardcoded configuration values
 * into a single, validated, type-safe source of truth.
 * 
 * Features:
 * - Type-safe configuration (TypeScript interfaces)
 * - Environment variable parsing with defaults
 * - Configuration validation on startup
 * - Clear documentation of each setting
 * - Easy to extend with new settings
 */

import logger from '@/services/loggerService';

/**
 * Redis Configuration
 */
export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db?: number;
}

/**
 * Queue Configuration
 * Defines behavior for each BullMQ queue
 */
export interface QueueConfig {
    emailQueue: {
        concurrency: number;
        timeout: number; // milliseconds
        retries: number;
    };
    mangaImportQueue: {
        concurrency: number;
        timeout: number;
        retries: number;
    };
    mangaChapterImportQueue: {
        concurrency: number;
        timeout: number;
        retries: number;
    };
    chapterDownload: {
        timeout: number;
        retries: number;
        previewCount: number;
        defaultConcurrency: number;
        defaultLimiter: {
            max: number;
            duration: number;
        };
    };
    storageCleanupQueue: {
        concurrency: number;
        timeout: number;
        retries: number;
    };
    seriesMigrationQueue: {
        concurrency: number;
        timeout: number;
        retries: number;
    };
}

/**
 * Cache Configuration
 */
export interface CacheConfig {
    trendingTTL: number; // seconds
    redisCleanupInterval: number; // milliseconds
}

/**
 * Scraper Configuration
 */
export interface ScraperConfig {
    chapterStorageRoot: string;
    weebCentral: {
        apiUrl: string;
        userAgent: string;
        timeout: number; // milliseconds
        maxSearchVariants: number;
        priority: number; // 1 = highest priority
        enabled: boolean;
    };
    asuraComic: {
        baseUrl: string;
        userAgent: string;
        timeout: number; // milliseconds
        priority: number; // 1 = highest priority
        enabled: boolean;
    };
    comix: {
        baseUrl: string;
        searchApiUrl: string;
        userAgent: string;
        timeout: number; // milliseconds
        priority: number; // 1 = highest priority
        enabled: boolean;
        flareSolverrUrl: string;
    };
    atsuMoe: {
        apiUrl: string;
        baseUrl: string;
        userAgent: string;
        timeout: number; // milliseconds
        priority: number; // 1 = highest priority
        enabled: boolean;
    };
    nHentai: {
        userAgent: string;
        timeout: number; // milliseconds
        priority: number; // 1 = highest priority
        enabled: boolean;
    };
    mangaDex: {
        apiUrl: string;
        baseUrl: string;
        userAgent: string;
        timeout: number; // milliseconds
        priority: number; // 1 = highest priority
        enabled: boolean;
    };
    mangaTaro: {
        apiUrl: string;
        baseUrl: string;
        userAgent: string;
        timeout: number; // milliseconds
        priority: number; // 1 = highest priority
        enabled: boolean;
    };
    toonily: {
        baseUrl: string;
        userAgent: string;
        timeout: number; // milliseconds
        priority: number; // 1 = highest priority
        enabled: boolean;
    };
    kagane: {
        apiUrl: string;
        baseUrl: string;
        userAgent: string;
        flareSolverrUrl?: string;
        timeout: number; // milliseconds
        priority: number; // 1 = highest priority
        enabled: boolean;
    };
    mangaFire: {
        baseUrl: string;
        userAgent: string;
        timeout: number; // milliseconds
        priority: number; // 1 = highest priority
        enabled: boolean;
        language: string;
    };
}

/**
 * Logging Configuration
 */
export interface LoggingConfig {
    level: 'debug' | 'info' | 'warn' | 'error';
    maxErrorLines: number;
    includeStackTrace: boolean;
}

/**
 * Discord Configuration
 */
export interface DiscordConfig {
    publicWebhookUrl?: string;
    adminWebhookUrl?: string;
    /** @deprecated Use DISCORD_PUBLIC_WEBHOOK_URL / DISCORD_ADMIN_WEBHOOK_URL */
    webhookUrl?: string;
    enabled: boolean;
    rateLimit: number; // milliseconds between notifications
    colors: {
        success: number;
        warning: number;
        error: number;
        info: number;
    };
}

/**
 * Timeout Configuration
 */
export interface TimeoutConfig {
    socket: number; // milliseconds
    transaction: number; // milliseconds
    httpRequest: number; // milliseconds
}

export interface MetricsConfig {
    queueMetricsEnabled: boolean;
    queueMetricsIntervalMs: number;
}

/**
 * Main Application Configuration
 */
export interface AppConfig {
    port: number;
    env: 'development' | 'production' | 'test';
    redis: RedisConfig;
    queues: QueueConfig;
    cache: CacheConfig;
    scraper: ScraperConfig;
    logging: LoggingConfig;
    discord: DiscordConfig;
    timeouts: TimeoutConfig;
    metrics: MetricsConfig;
}

/**
 * Parse environment variable as number with fallback
 */
function parseEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) return defaultValue;
    const parsed = Number(value);
    if (isNaN(parsed)) {
        logger.warn(`Invalid number for ${key}: "${value}", using default: ${defaultValue}`);
        return defaultValue;
    }
    return parsed;
}

/**
 * Parse environment variable as string with fallback
 */
function parseEnvString(key: string, defaultValue?: string): string {
    return process.env[key] || defaultValue || '';
}

/**
 * Parse environment variable as boolean
 */
function parseEnvBoolean(key: string, defaultValue: boolean = false): boolean {
    const value = process.env[key];
    if (!value) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Application Configuration Service
 * 
 * Usage:
 * ```typescript
 * import { appConfig } from '@/config/appConfig';
 * 
 * // Access configuration
 * const redisHost = appConfig.redis.host;
 * const queueConcurrency = appConfig.queues.chapterDownload.defaultConcurrency;
 * 
 * // All values are type-safe with full IDE autocomplete
 * ```
 */
export class AppConfigService {
    /**
     * Load and validate application configuration from environment variables
     * @returns Validated application configuration object
     */
    static loadConfig(): AppConfig {
        const env = (process.env.NODE_ENV || 'development') as any;

        const config: AppConfig = {
            // Basic Application Settings
            port: parseEnvNumber('PORT', 3000),
            env,

            // Redis Configuration
            redis: {
                host: parseEnvString('REDIS_HOST', '127.0.0.1'),
                port: parseEnvNumber('REDIS_PORT', 6379),
                password: parseEnvString('REDIS_PASS', undefined),
                db: parseEnvNumber('REDIS_DB', 0),
            },

            // Queue Configuration
            // Per-queue settings for BullMQ workers
            queues: {
                emailQueue: {
                    concurrency: parseEnvNumber('EMAIL_QUEUE_CONCURRENCY', 2),
                    timeout: parseEnvNumber('EMAIL_QUEUE_TIMEOUT', 30 * 60 * 1000), // 30 minutes
                    retries: parseEnvNumber('EMAIL_QUEUE_RETRIES', 3),
                },
                mangaImportQueue: {
                    concurrency: parseEnvNumber('MANGA_IMPORT_QUEUE_CONCURRENCY', 1),
                    timeout: parseEnvNumber('MANGA_IMPORT_QUEUE_TIMEOUT', 60 * 60 * 1000), // 1 hour
                    retries: parseEnvNumber('MANGA_IMPORT_QUEUE_RETRIES', 0),
                },
                mangaChapterImportQueue: {
                    concurrency: parseEnvNumber('CHAPTER_SCAN_CONCURRENCY', 1), // RESTORED to 1 (rate limiting)
                    timeout: parseEnvNumber('CHAPTER_SCAN_TIMEOUT', 30 * 60 * 1000), // 30 minutes
                    retries: parseEnvNumber('CHAPTER_SCAN_RETRIES', 1),
                },
                chapterDownload: {
                    timeout: parseEnvNumber('CHAPTER_DOWNLOAD_TIMEOUT', 15 * 60 * 1000), // 15 minutes
                    retries: parseEnvNumber('CHAPTER_DOWNLOAD_RETRIES', 2),
                    previewCount: parseEnvNumber('CHAPTER_PREVIEW_COUNT', 10),
                    defaultConcurrency: parseEnvNumber('CHAPTER_DOWNLOAD_CONCURRENCY', 2),
                    defaultLimiter: {
                        max: parseEnvNumber('CHAPTER_DOWNLOAD_RATE_MAX', 3),
                        duration: parseEnvNumber('CHAPTER_DOWNLOAD_RATE_DURATION', 1000),
                    },
                },
                storageCleanupQueue: {
                    concurrency: parseEnvNumber('STORAGE_CLEANUP_CONCURRENCY', 1),
                    timeout: parseEnvNumber('STORAGE_CLEANUP_TIMEOUT', 30 * 60 * 1000),
                    retries: parseEnvNumber('STORAGE_CLEANUP_RETRIES', 2),
                },
                seriesMigrationQueue: {
                    concurrency: parseEnvNumber('SERIES_MIGRATION_CONCURRENCY', 1),
                    timeout: parseEnvNumber('SERIES_MIGRATION_TIMEOUT', 60 * 60 * 1000),
                    retries: parseEnvNumber('SERIES_MIGRATION_RETRIES', 1),
                },
            },

            // Cache Configuration
            cache: {
                // TTL for trending manga cache
                trendingTTL: parseEnvNumber('TRENDING_CACHE_TTL', 3600), // 1 hour
                // Interval for Redis cleanup
                redisCleanupInterval: parseEnvNumber('REDIS_CLEAR', 0),
            },

            // Scraper Configuration
            scraper: {
                // Where to store downloaded chapter images
                chapterStorageRoot: parseEnvString(
                    'CHAPTER_STORAGE_ROOT',
                    './chapters'
                ),
                weebCentral: {
                    apiUrl: 'https://weebcentral.com/search/simple?location=main',
                    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    timeout: parseEnvNumber('WEEB_CENTRAL_TIMEOUT', 30000), // 30 seconds
                    maxSearchVariants: parseEnvNumber('WEEB_CENTRAL_MAX_VARIANTS', 4),
                    priority: parseEnvNumber('WEEB_CENTRAL_PRIORITY', 1), // 1 = highest priority
                    enabled: parseEnvBoolean('WEEB_CENTRAL_ENABLED', true),
                },
                asuraComic: {
                    baseUrl: 'https://asuracomic.net',
                    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    timeout: parseEnvNumber('ASURA_COMIC_TIMEOUT', 30000), // 30 seconds
                    priority: parseEnvNumber('ASURA_COMIC_PRIORITY', 2), // 2 = second priority tier
                    enabled: parseEnvBoolean('ASURA_COMIC_ENABLED', true),
                },
                comix: {
                    baseUrl: 'https://comix.to',
                    searchApiUrl: 'https://comix.to/api/v1/manga',
                    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    timeout: parseEnvNumber('COMIX_TIMEOUT', 30000), // 30 seconds
                    enabled: parseEnvBoolean('COMIX_ENABLED', true),
                    priority: parseEnvNumber('COMIX_PRIORITY', 4), // 4 = third priority tier
                    flareSolverrUrl: parseEnvString('KAGANE_FLARESOLVERR_URL') || parseEnvString('FLARESOLVERR_URL'),
                },
                atsuMoe: {
                    apiUrl: 'https://atsu.moe/collections/manga/documents/search',
                    baseUrl: 'https://atsu.moe',
                    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    timeout: parseEnvNumber('ATSU_MOE_TIMEOUT', 30000), // 30 seconds
                    priority: parseEnvNumber('ATSU_MOE_PRIORITY', 2), // 2 = second priority
                    enabled: parseEnvBoolean('ATSU_MOE_ENABLED', true),
                },
                nHentai: {
                    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    timeout: parseEnvNumber('NHENTAI_TIMEOUT', 30000), // 30 seconds
                    priority: parseEnvNumber('NHENTAI_PRIORITY', 3), // 3 = third priority (last fallback)
                    enabled: parseEnvBoolean('NHENTAI_ENABLED', true),
                },
                mangaDex: {
                    apiUrl: 'https://api.mangadex.org',
                    baseUrl: 'https://mangadex.org',
                    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    timeout: parseEnvNumber('MANGADEX_TIMEOUT', 30000), // 30 seconds
                    priority: parseEnvNumber('MANGADEX_PRIORITY', 4), // 4 = fourth priority (after WeebCentral and before nHentai)
                    enabled: parseEnvBoolean('MANGADEX_ENABLED', true),
                },
                mangaTaro: {
                    apiUrl: 'https://mangataro.org',
                    baseUrl: 'https://mangataro.org',
                    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    timeout: parseEnvNumber('MANGATARO_TIMEOUT', 30000), // 30 seconds
                    priority: parseEnvNumber('MANGATARO_PRIORITY', 2), // 2 = second priority
                    enabled: parseEnvBoolean('MANGATARO_ENABLED', true),
                },
                toonily: {
                    baseUrl: 'https://toonily.com',
                    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    timeout: parseEnvNumber('TOONILY_TIMEOUT', 30000), // 30 seconds
                    priority: parseEnvNumber('TOONILY_PRIORITY', 5), // 5 = fifth priority
                    enabled: parseEnvBoolean('TOONILY_ENABLED', true),
                },
                kagane: {
                    apiUrl: 'https://yuzuki.kagane.to',
                    baseUrl: 'https://kagane.to',
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
                    flareSolverrUrl: parseEnvString('KAGANE_FLARESOLVERR_URL') || parseEnvString('FLARESOLVERR_URL'),
                    timeout: parseEnvNumber('KAGANE_TIMEOUT', 30000), // 30 seconds
                    priority: parseEnvNumber('KAGANE_PRIORITY', 3), // 3 = third priority tier
                    enabled: parseEnvBoolean('KAGANE_ENABLED', true),
                },
                mangaFire: {
                    baseUrl: 'https://mangafire.to/',
                    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    timeout: parseEnvNumber('MANGAFIRE_TIMEOUT', 30000), // 30 seconds
                    priority: parseEnvNumber('MANGAFIRE_PRIORITY', 2), // 2 = second priority
                    enabled: parseEnvBoolean('MANGAFIRE_ENABLED', true),
                    language: 'en'
                },
            },

            // Logging Configuration
            logging: {
                level: (parseEnvString('LOG_LEVEL', 'info') as any) || 'info',
                maxErrorLines: parseEnvNumber('LOG_MAX_ERROR_LINES', 5),
                includeStackTrace: parseEnvBoolean('LOG_STACK_TRACE', false),
            },

            // Discord Integration
            discord: {
                publicWebhookUrl: parseEnvString('DISCORD_PUBLIC_WEBHOOK_URL'),
                adminWebhookUrl: parseEnvString('DISCORD_ADMIN_WEBHOOK_URL'),
                webhookUrl: parseEnvString('DISCORD_WEBHOOK_URL'),
                enabled: parseEnvBoolean('ENABLE_DISCORD_NOTIFICATIONS', false) || parseEnvBoolean('DISCORD_ENABLED', false),
                rateLimit: parseEnvNumber('DISCORD_RATE_LIMIT', 1000), // 1 second
                colors: {
                    success: 0x10b981, // Green
                    warning: 0xf59e0b, // Amber
                    error: 0xef4444,   // Red
                    info: 0x3b82f6,    // Blue
                },
            },

            // Metrics / Observability
            metrics: {
                queueMetricsEnabled: parseEnvBoolean('QUEUE_METRICS_ENABLED', false),
                queueMetricsIntervalMs: parseEnvNumber('QUEUE_METRICS_INTERVAL_MS', 60000),
            },

            // Timeout Settings
            timeouts: {
                socket: parseEnvNumber('SOCKET_TIMEOUT', 0), // No timeout (0 = infinite)
                transaction: parseEnvNumber('TRANSACTION_TIMEOUT', 30000), // 30 seconds
                httpRequest: parseEnvNumber('HTTP_REQUEST_TIMEOUT', 30000), // 30 seconds
            },
        };

        // Validate critical configuration
        this.validateConfig(config);

        return config;
    }

    /**
     * Validate critical configuration values
     * Logs warnings for suspicious settings
     * @throws Error if validation fails
     */
    private static validateConfig(config: AppConfig): void {
        const issues: string[] = [];

        // Validate Redis connection
        if (!config.redis.host) {
            issues.push('Redis host is not configured');
        }

        // Validate queue concurrency
        for (const [queueName, queueConfig] of Object.entries(config.queues)) {
            if (queueConfig.concurrency < 1) {
                issues.push(`Queue "${queueName}" has invalid concurrency (< 1)`);
            }
            if (queueConfig.timeout < 60000) {
                logger.warn(
                    `Queue "${queueName}" timeout is very short (${queueConfig.timeout}ms)`,
                    { service: 'appConfig' }
                );
            }
        }

        // Validate storage path
        if (!config.scraper.chapterStorageRoot) {
            issues.push('Chapter storage root is not configured');
        }

        // Warn about missing Discord webhook
        if (config.discord.enabled) {
            const hasPublic =
                config.discord.publicWebhookUrl || config.discord.webhookUrl;
            const hasAdmin =
                config.discord.adminWebhookUrl || config.discord.webhookUrl;
            if (!hasPublic || !hasAdmin) {
                logger.warn(
                    'Discord notifications enabled but webhook URL(s) missing (set DISCORD_PUBLIC_WEBHOOK_URL and DISCORD_ADMIN_WEBHOOK_URL)',
                    { service: 'appConfig' }
                );
            }
        }

        // Log all issues
        if (issues.length > 0) {
            const message = `Configuration validation issues:\n${issues.map(i => `  - ${i}`).join('\n')}`;
            logger.error(message, { service: 'appConfig' });
            // In production, you might throw here to fail startup
            if (config.env === 'production') {
                throw new Error(`Critical configuration issues: ${issues.join(', ')}`);
            }
        }

        logger.info(
            `Application configuration loaded for environment: ${config.env}`,
            { service: 'appConfig' }
        );
    }

    /**
     * Get a human-readable summary of configuration
     * Useful for debugging and startup logs
     */
    static summarize(config: AppConfig): string {
        return `
Application Configuration Summary:
  Environment: ${config.env}
  Port: ${config.port}
  Redis: ${config.redis.host}:${config.redis.port}
  Queue Concurrency:
    - Email: ${config.queues.emailQueue.concurrency}
    - Manga Import: ${config.queues.mangaImportQueue.concurrency}
    - Chapter Scan: ${config.queues.mangaChapterImportQueue.concurrency}
    - Chapter Download (default): ${config.queues.chapterDownload.defaultConcurrency} per scraper queue
  Cache TTL: ${config.cache.trendingTTL}s
  Chapter Storage: ${config.scraper.chapterStorageRoot}
  Logging Level: ${config.logging.level}
  Discord: ${config.discord.enabled ? 'Enabled' : 'Disabled'}
        `.trim();
    }
}

// Load and export singleton configuration instance
export const appConfig = AppConfigService.loadConfig();

// Log configuration summary on startup
if (process.env.NODE_ENV !== 'test') {
    logger.info(AppConfigService.summarize(appConfig), { service: 'appConfig' });
}
