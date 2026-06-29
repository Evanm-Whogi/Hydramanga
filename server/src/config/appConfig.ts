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
    archiveAcquireQueue: {
        concurrency: number;
        timeout: number;
        retries: number;
    };
    archiveIngestQueue: {
        concurrency: number;
        timeout: number;
        retries: number;
    };
    archivePollQueue: {
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
    /**
     * Proxy-agnostic scraper egress. When `enabled`, all scraper transports
     * (axios + Playwright + image downloads) route through `url` (today a
     * gluetun HTTP proxy; swap the URL for a residential provider with zero
     * scraper code changes). `perScraper` overrides the global URL per scraper id.
     * `disabled` lists scraper ids that egress directly even when the proxy is on
     * (e.g. Kagane, which blocks datacenter IPs). When the proxy is disabled
     * globally, scrapers behave exactly as before (bare keep-alive agents).
     */
    proxy: {
        enabled: boolean;
        url: string;
        perScraper: Record<string, string>;
        disabled: string[];
    };
    /**
     * Control-API client config for the gluetun container that fronts scraper
     * egress. Used to read the current exit IP and to rotate it (stop→start)
     * on sustained ban signals or an admin "rotate now".
     */
    egressVpn: {
        controlUrl: string;
        timeout: number; // ms for control-API calls
        rotateCooldownMs: number; // min spacing between auto-rotations
        banThreshold: number; // distinct ban signals within the window to rotate
        banWindowMs: number; // sliding-window length for ban-signal counting
    };
    /** Optional user-agent rotation pool (politeness). Empty → each scraper's own UA. */
    userAgents: string[];
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
 * Object Storage (S3 / Garage) Configuration
 * Media (chapter images, profile pictures, stickers) is stored in S3-compatible
 * Garage buckets and served directly from each bucket's public web endpoint.
 * All buckets share one set of credentials/endpoint; only name + public URL differ.
 */
export interface S3BucketConfig {
    bucket: string;
    publicBaseUrl: string;   // Public read URL prefix, e.g. https://manga.garage.chit.sh
}

export interface StorageConfig {
    endpoint: string;        // S3 API endpoint, e.g. http://s3.chit.sh:3900
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean; // Garage typically needs path-style addressing
    manga: S3BucketConfig;
    profilePictures: S3BucketConfig;
    stickers: S3BucketConfig;
}

/**
 * Archive Ingestion (Torrent) Configuration
 *
 * Drives the parallel acquisition pipeline that backfills completed/large
 * back-catalogs from whole-series torrent archives (nyaa via Prowlarr →
 * qBittorrent → unpack/segment → Garage), with scraping demoted to fallback.
 * See docs/archive-ingestion-plan.md.
 */
export interface ArchiveConfig {
    /** Master switch for the whole archive pipeline (router, queues, poller, admin trigger). */
    enabled: boolean;

    /** Prowlarr aggregator (Torznab indexers, incl. nyaa). */
    prowlarr: {
        url: string;
        apiKey: string;
        /** Comma-separated Prowlarr indexer ids to query (empty = all configured). */
        indexerIds: number[];
        timeout: number; // ms
    };

    /** qBittorrent download client (reached through the VPN container in dev). */
    qbittorrent: {
        url: string;
        username: string;
        password: string;
        /** Category applied to submitted torrents (isolates our downloads). */
        category: string;
        timeout: number; // ms
    };

    /**
     * VPN pre-flight guard. In dev all torrent traffic must egress through Mullvad
     * (gluetun, with killswitch); the guard verifies that before any submit. In
     * production (DMCA-ignored host) the VPN is not used and the guard is disabled.
     */
    vpn: {
        /** When true, refuse to submit torrents unless the VPN guard passes. */
        required: boolean;
        /** gluetun control-server base URL (publicip/status endpoints). */
        gluetunControlUrl: string;
        /** Expected VPN provider name reported by gluetun (sanity check). */
        expectedProvider: string;
        timeout: number; // ms
    };

    /** Candidate gates + scoring thresholds (see plan §2). */
    candidate: {
        languageFilter: string;       // 'en'
        minSeeders: number;
        minBytesPerChapter: number;   // size-sanity lower bound, per expected chapter
        maxArchiveBytes: number;      // hard per-archive size cap
        /** Min normalized title-match score (0–100) to trust a candidate. */
        minTitleScore: number;
    };

    /** Source-selection resolver thresholds (see plan §2). */
    router: {
        /** Known backlog at/above which a non-completed series still earns an archive attempt. */
        backfillGapThreshold: number;
    };

    /** Download poller + ingest pipeline. */
    pipeline: {
        /** How often the download poller checks qBittorrent for finished torrents (ms). */
        pollIntervalMs: number;
        /** Give up on a torrent that hasn't completed within this window (ms). */
        downloadStallTimeoutMs: number;
        /** Scratch dir for in-progress downloads + unpack (host-mounted, freed after ingest). */
        scratchDir: string;
        /** Bounded concurrency for the CPU/IO-heavy ingest queue. */
        ingestConcurrency: number;
        /** Acquire-queue rate limit (don't hammer the indexer / saturate disk). */
        acquireLimiter: { max: number; duration: number };
        /** Minimum segmentation confidence (0–1) to auto-ingest; below → needs_review. */
        segmentationConfidenceThreshold: number;
        /** Path to the `djxl` binary for the out-of-process JXL→PNG fallback. */
        djxlPath: string;
        /** WebP quality for archive page transcode (higher than scrape — pristine scans). */
        webpQuality: number;
        /** WebP effort (0–6) for archive page transcode. */
        webpEffort: number;
        /** Pages transcoded+uploaded in parallel per chapter (libvips threads within each). */
        transcodeBatchSize: number;
    };
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
    storage: StorageConfig;
    archive: ArchiveConfig;
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
 * Parse a comma-separated list of integers (e.g. "1,2,5"), ignoring blanks/NaN.
 */
function parseEnvNumberList(key: string): number[] {
    const value = process.env[key];
    if (!value) return [];
    return value
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((n) => Number.isFinite(n));
}

/**
 * Parse a comma- or newline-separated list of strings, trimming and dropping blanks.
 */
function parseEnvStringList(key: string): string[] {
    const value = process.env[key];
    if (!value) return [];
    return value
        .split(/[\n,]/)
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
}

/**
 * Parse a JSON object env var into a string→string map. Returns {} on absence or
 * malformed JSON (logged), so a bad override never crashes config load.
 */
function parseEnvJsonMap(key: string): Record<string, string> {
    const value = process.env[key];
    if (!value) return {};
    try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const out: Record<string, string> = {};
            for (const [k, v] of Object.entries(parsed)) {
                if (typeof v === 'string') out[k] = v;
            }
            return out;
        }
        logger.warn(`Invalid JSON object for ${key}, expected a string map; ignoring`);
    } catch {
        logger.warn(`Failed to parse JSON for ${key}; ignoring`);
    }
    return {};
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
                // Archive acquire: rate-limited (don't hammer the indexer); submits + returns fast.
                archiveAcquireQueue: {
                    concurrency: parseEnvNumber('ARCHIVE_ACQUIRE_CONCURRENCY', 1),
                    timeout: parseEnvNumber('ARCHIVE_ACQUIRE_TIMEOUT', 5 * 60 * 1000),
                    retries: parseEnvNumber('ARCHIVE_ACQUIRE_RETRIES', 1),
                },
                // Archive ingest: CPU/IO heavy (unpack + transcode); low concurrency, long timeout.
                archiveIngestQueue: {
                    concurrency: parseEnvNumber('ARCHIVE_INGEST_CONCURRENCY', 1),
                    timeout: parseEnvNumber('ARCHIVE_INGEST_TIMEOUT', 6 * 60 * 60 * 1000), // 6h
                    retries: parseEnvNumber('ARCHIVE_INGEST_RETRIES', 1),
                },
                // Archive download poller: lightweight status sweep on a repeatable schedule.
                archivePollQueue: {
                    concurrency: parseEnvNumber('ARCHIVE_POLL_CONCURRENCY', 1),
                    timeout: parseEnvNumber('ARCHIVE_POLL_TIMEOUT', 5 * 60 * 1000),
                    retries: parseEnvNumber('ARCHIVE_POLL_RETRIES', 0),
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
                proxy: {
                    enabled: parseEnvBoolean('SCRAPER_PROXY_ENABLED', false),
                    url: parseEnvString('SCRAPER_PROXY_URL'),
                    // JSON map of scraperId → proxy URL, e.g. {"weebcentral":"http://gluetun-scraper:8888"}
                    perScraper: parseEnvJsonMap('SCRAPER_PROXY_PER_SCRAPER'),
                    // Comma-separated scraper ids that bypass the proxy even when it's on, e.g. "kagane"
                    disabled: parseEnvStringList('SCRAPER_PROXY_DISABLED'),
                },
                egressVpn: {
                    controlUrl: parseEnvString('SCRAPER_GLUETUN_CONTROL_URL', 'http://gluetun-scraper:8000'),
                    timeout: parseEnvNumber('SCRAPER_GLUETUN_CONTROL_TIMEOUT', 10000),
                    rotateCooldownMs: parseEnvNumber('SCRAPER_VPN_ROTATE_COOLDOWN_MS', 60 * 1000),
                    banThreshold: parseEnvNumber('SCRAPER_BAN_THRESHOLD', 3),
                    banWindowMs: parseEnvNumber('SCRAPER_BAN_WINDOW_MS', 5 * 60 * 1000),
                },
                userAgents: parseEnvStringList('SCRAPER_USER_AGENTS'),
            },

            // Object Storage Configuration (S3-compatible / Garage)
            // Shared credentials/endpoint; one bucket per media type.
            storage: {
                endpoint: parseEnvString('S3_ENDPOINT_URL', 'http://s3.chit.sh:3900'),
                region: parseEnvString('S3_REGION', 'garage'),
                accessKeyId: parseEnvString('S3_ACCESS_KEY_ID', ''),
                secretAccessKey: parseEnvString('S3_SECRET_ACCESS_KEY', ''),
                forcePathStyle: parseEnvBoolean('S3_FORCE_PATH_STYLE', true),
                manga: {
                    bucket: parseEnvString('S3_BUCKET_NAME', 'manga'),
                    publicBaseUrl: parseEnvString('S3_PUBLIC_BASE_URL', 'https://manga.garage.chit.sh'),
                },
                profilePictures: {
                    bucket: parseEnvString('S3_PROFILE_BUCKET_NAME', 'profile-pictures'),
                    publicBaseUrl: parseEnvString('S3_PROFILE_PUBLIC_BASE_URL', 'https://profile-pictures.garage.chit.sh'),
                },
                stickers: {
                    bucket: parseEnvString('S3_STICKER_BUCKET_NAME', 'stickers'),
                    publicBaseUrl: parseEnvString('S3_STICKER_PUBLIC_BASE_URL', 'https://stickers.garage.chit.sh'),
                },
            },

            // Archive Ingestion (Torrent) Configuration
            archive: {
                enabled: parseEnvBoolean('ARCHIVE_INGEST_ENABLED', false),
                prowlarr: {
                    url: parseEnvString('PROWLARR_URL', 'http://prowlarr:9696'),
                    apiKey: parseEnvString('PROWLARR_API_KEY', ''),
                    indexerIds: parseEnvNumberList('PROWLARR_INDEXER_IDS'),
                    timeout: parseEnvNumber('PROWLARR_TIMEOUT', 30000),
                },
                qbittorrent: {
                    url: parseEnvString('QBITTORRENT_URL', 'http://gluetun:8080'),
                    username: parseEnvString('QBITTORRENT_USERNAME', 'admin'),
                    password: parseEnvString('QBITTORRENT_PASSWORD', ''),
                    category: parseEnvString('QBITTORRENT_CATEGORY', 'manga-archive'),
                    timeout: parseEnvNumber('QBITTORRENT_TIMEOUT', 30000),
                },
                vpn: {
                    // Default ON unless explicitly in production (DMCA-ignored host needs no VPN).
                    required: parseEnvBoolean('ARCHIVE_VPN_REQUIRED', env !== 'production'),
                    gluetunControlUrl: parseEnvString('GLUETUN_CONTROL_URL', 'http://gluetun:8000'),
                    expectedProvider: parseEnvString('ARCHIVE_VPN_PROVIDER', 'mullvad'),
                    timeout: parseEnvNumber('GLUETUN_CONTROL_TIMEOUT', 10000),
                },
                candidate: {
                    languageFilter: parseEnvString('ARCHIVE_LANGUAGE_FILTER', 'en'),
                    minSeeders: parseEnvNumber('ARCHIVE_MIN_SEEDERS', 2),
                    minBytesPerChapter: parseEnvNumber('ARCHIVE_MIN_BYTES_PER_CHAPTER', 200 * 1024), // 200 KiB
                    maxArchiveBytes: parseEnvNumber('ARCHIVE_MAX_BYTES', 50 * 1024 * 1024 * 1024), // 50 GiB
                    minTitleScore: parseEnvNumber('ARCHIVE_MIN_TITLE_SCORE', 80),
                },
                router: {
                    backfillGapThreshold: parseEnvNumber('BACKFILL_GAP_THRESHOLD', 50),
                },
                pipeline: {
                    pollIntervalMs: parseEnvNumber('ARCHIVE_POLL_INTERVAL_MS', 60 * 1000),
                    downloadStallTimeoutMs: parseEnvNumber('ARCHIVE_DOWNLOAD_STALL_TIMEOUT_MS', 6 * 60 * 60 * 1000), // 6h
                    scratchDir: parseEnvString('ARCHIVE_SCRATCH_DIR', '/data/archive-scratch'),
                    ingestConcurrency: parseEnvNumber('ARCHIVE_INGEST_CONCURRENCY', 1),
                    acquireLimiter: {
                        max: parseEnvNumber('ARCHIVE_ACQUIRE_RATE_MAX', 1),
                        duration: parseEnvNumber('ARCHIVE_ACQUIRE_RATE_DURATION', 10000),
                    },
                    segmentationConfidenceThreshold: parseEnvNumber('ARCHIVE_SEGMENTATION_CONFIDENCE', 0.8),
                    djxlPath: parseEnvString('DJXL_PATH', 'djxl'),
                    webpQuality: parseEnvNumber('ARCHIVE_WEBP_QUALITY', 90),
                    webpEffort: parseEnvNumber('ARCHIVE_WEBP_EFFORT', 4),
                    transcodeBatchSize: parseEnvNumber('ARCHIVE_TRANSCODE_BATCH_SIZE', 8),
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

        // Validate object storage (S3 / Garage) configuration
        if (!config.storage.endpoint) {
            issues.push('S3 endpoint (S3_ENDPOINT_URL) is not configured');
        }
        for (const [label, b] of [
            ['manga', config.storage.manga],
            ['profilePictures', config.storage.profilePictures],
            ['stickers', config.storage.stickers],
        ] as const) {
            if (!b.bucket) issues.push(`S3 bucket name for ${label} is not configured`);
            if (!b.publicBaseUrl) issues.push(`S3 public base URL for ${label} is not configured`);
        }
        if (!config.storage.accessKeyId || !config.storage.secretAccessKey) {
            // Credentials are required to upload/delete objects; warn in dev, fail in prod
            if (config.env === 'production') {
                issues.push('S3 credentials (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY) are not configured');
            } else {
                logger.warn(
                    'S3 credentials (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY) are not set; uploads/deletes will fail',
                    { service: 'appConfig' }
                );
            }
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
  Object Storage @ ${config.storage.endpoint} — manga: ${config.storage.manga.bucket}, profile: ${config.storage.profilePictures.bucket}, stickers: ${config.storage.stickers.bucket}
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
