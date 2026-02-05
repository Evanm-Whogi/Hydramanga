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
    mangaChapterDownloadQueue: {
        concurrency: number;
        timeout: number;
        retries: number;
        previewCount: number;
        limiter: {
            max: number;
            duration: number;
        };
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
    comix: {
        apiUrl: string;
        baseUrl: string;
        userAgent: string;
        timeout: number; // milliseconds
        priority: number; // 1 = highest priority
        enabled: boolean;
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
 * const queueConcurrency = appConfig.queues.mangaChapterDownloadQueue.concurrency;
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
                mangaChapterDownloadQueue: {
                    concurrency: parseEnvNumber('CHAPTER_DOWNLOAD_CONCURRENCY', 2), // modest parallelism
                    timeout: parseEnvNumber('CHAPTER_DOWNLOAD_TIMEOUT', 15 * 60 * 1000), // 15 minutes
                    retries: parseEnvNumber('CHAPTER_DOWNLOAD_RETRIES', 2),
                    previewCount: parseEnvNumber('CHAPTER_PREVIEW_COUNT', 10),
                    limiter: {
                        max: parseEnvNumber('CHAPTER_DOWNLOAD_RATE_MAX', 3), // requests per duration window
                        duration: parseEnvNumber('CHAPTER_DOWNLOAD_RATE_DURATION', 1000), // ms
                    },
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
                comix: {
                    apiUrl: 'https://comix.to/api/v2',
                    baseUrl: 'https://comix.to',
                    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    timeout: parseEnvNumber('COMIX_TIMEOUT', 30000), // 30 seconds
                    priority: parseEnvNumber('COMIX_PRIORITY', 3), // 3 = third priority
                    enabled: parseEnvBoolean('COMIX_ENABLED', true),
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
                webhookUrl: parseEnvString('DISCORD_WEBHOOK_URL'),
                enabled: parseEnvBoolean('DISCORD_ENABLED', false),
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
        if (config.discord.enabled && !config.discord.webhookUrl) {
            logger.warn(
                'Discord notifications enabled but webhook URL not configured',
                { service: 'appConfig' }
            );
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
    - Chapter Download: ${config.queues.mangaChapterDownloadQueue.concurrency}
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
