/*
    Service: QueueService
    Description: Service to create and manage queues using BullMQ
    Methods:
        - getQueue(queueName: string): Queue
        - addJob(queueName: string, jobName: string, jobData: any): Promise<Job>
        - clearQueue(queueName: string): Promise<void>
        - createWorker(queueName: string): void
    Usage:
        - Use getQueue method to get the queue by name
        - Use addJob method to add a job to the queue
        - Use createWorker method to create a worker for the queue
        - Use clearQueue method to clear the queue
*/
import { Queue, Worker, QueueOptions, Job } from 'bullmq';
import Redis from 'ioredis';
import logger from '@/services/loggerService';
import { queueJobFunction } from '@/types/types'; // Import types
import { jobHandlerRegistry } from '@/jobs/handlers/JobHandlerRegistry';
import { appConfig } from '@/config/appConfig';
import { discordService } from '@/services/discordService';
import {chapterDownloadQueueName, getAllChapterDownloadQueueNames, isChapterDownloadJobQueue, isChapterDownloadQueue, resolveChapterDownloadQueueConfig, scraperIdFromChapterDownloadQueue} from '@/lib/chapterDownloadQueues';

class QueueService {
    private queues: { [key: string]: Queue } = {};
    private workers: { [key: string]: Worker } = {};
    private cleanupFunctions: (() => Promise<void>)[] = [];
    private redisConnection: any;
    private redisClient: Redis;
    private metricsInterval?: NodeJS.Timeout;

    constructor() {
      this.redisConnection = appConfig.redis;
      this.redisClient = new Redis(this.redisConnection);
      logger.info(`QueueService initialized with Redis connection: ${this.redisConnection.host}:${this.redisConnection.port}`, { service: 'queueService' });

            if (appConfig.metrics.queueMetricsEnabled && appConfig.metrics.queueMetricsIntervalMs > 0) {
                    this.startQueueMetricsLogging();
            }
    }

    public getRedisClient(): Redis {
        return this.redisClient;
    }

    // Dynamic Queue
    public getQueue(queueName: string): Queue {
        if (!this.queues[queueName]) {
            const queueOptions: QueueOptions = {
                connection: this.redisConnection,
            };

            logger.info(`Creating queue '${queueName}' with connection: ${this.redisConnection.host}:${this.redisConnection.port}`, { service: 'queueService' });
            this.queues[queueName] = new Queue(queueName, queueOptions);
            if (process.env.RUN_WORKERS === 'true') {
                this.createWorker(queueName);
            }
        }
        return this.queues[queueName];
    }

    // Add Job to Queue
    public addJob: queueJobFunction = async (queueName, jobName, jobData, options = {}) => {
        const queue = this.getQueue(queueName);
        
        // Compute default priority for chapter downloads, allowing callers to override via options
        let priority = 0;
        if (isChapterDownloadJobQueue(queueName)) {
            priority = this.computeChapterPriority(jobData);
        }
        
        const defaults = appConfig.queues;
        const retries = isChapterDownloadJobQueue(queueName)
            ? defaults.chapterDownload.retries
            : 3;
        const timeout = isChapterDownloadJobQueue(queueName)
            ? defaults.chapterDownload.timeout
            : 15 * 60 * 1000;

        // Default cleanup so queues do not bloat
        const job = await queue.add(jobName, jobData, {
            removeOnComplete: true,
            removeOnFail: 25,
            attempts: retries,
            backoff: { type: 'exponential', delay: 30000 },
            timeout,
            priority: priority,
            ...options
        });
        return job;
    }

    /** Route chapter download jobs to the per-scraper queue for isolated concurrency/rate limits. */
    public addChapterDownloadJob(jobName: string, jobData: Record<string, unknown>, options = {}) {
        const scraperId = jobData.scraperId as string | null | undefined;
        return this.addJob(chapterDownloadQueueName(scraperId), jobName, jobData, options);
    }

    /** Start workers for every known per-scraper chapter download queue. */
    public ensureChapterDownloadQueues(): void {
        for (const queueName of getAllChapterDownloadQueueNames()) {
            this.getQueue(queueName);
        }
    }

    // Create Worker
    private createWorker(queueName: string) {
        // Skip if worker already exists for this queue
        if (this.workers[queueName]) {
            return;
        }

        // Default rate limit; overridden per queue config (especially chapter downloads)
        let limiter = { max: 10, duration: 1000 };
        
        // Get queue-specific configuration
        let concurrency = 1;
        let timeout = 15 * 60 * 1000;
        
        const queueConfig = appConfig.queues[queueName as keyof typeof appConfig.queues];
        if (isChapterDownloadQueue(queueName)) {
            const scraperId = scraperIdFromChapterDownloadQueue(queueName) ?? 'unknown';
            const dlConfig = resolveChapterDownloadQueueConfig(scraperId);
            concurrency = dlConfig.concurrency;
            timeout = dlConfig.timeout;
            limiter = dlConfig.limiter;
        } else if (queueConfig && 'concurrency' in queueConfig) {
            concurrency = queueConfig.concurrency;
            timeout = queueConfig.timeout;
        }

        const worker = new Worker(queueName, async (job: any) => {
            const { name, data } = job;
            logger.info(`Processing Job: ${name} in Queue: ${queueName}`, { service: 'queueService' });

            // Use job handler registry to route jobs
            const handler = jobHandlerRegistry.getHandler(queueName);
            if (!handler) {
                throw new Error(`No handler registered for queue: ${queueName}`);
            }

            await handler.handle(data, job);
        }, {
            connection: this.redisConnection,
            limiter: limiter,
            concurrency: concurrency,
            lockDuration: timeout + 5000, // Lock duration must be longer than job timeout
            lockRenewTime: timeout / 2 // Renew lock halfway through timeout
        });

        // Track worker for cleanup
        this.workers[queueName] = worker;

        const onCompleted = (job: any) => {
            logger.info(`Job: ${job.id} in Queue: ${queueName} completed`, { service: 'queueService' });
        };

        const onFailed = async (job: any, err: any) => {
            const errorMessage = err?.message || 'Unknown error';
            const errorStack = err?.stack || '';
            
            // Log detailed error information for debugging
            logger.error(
                `Job: ${job?.id} in Queue: ${queueName} failed with error: ${errorMessage}`,
                { 
                    service: 'queueService',
                    jobName: job?.name,
                    attempts: job?.attemptsMade,
                    maxAttempts: job?.opts?.attempts,
                    errorStack: errorStack.split('\n').slice(0, 5).join(' | ') // First 5 lines of stack
                }
            );

            const maxAttempts = job?.opts?.attempts || 3;
            const allRetriesExhausted = job?.attemptsMade >= maxAttempts;

            // Chapter scan: notify Discord only when all retries are exhausted
            if (queueName === 'mangaChapterImportQueue' && allRetriesExhausted) {
                try {
                    const jobData = job?.data;
                    if (jobData?.seriesId && jobData?.mangaTitle) {
                        await discordService.notifyScraperFailed(
                            jobData.mangaTitle,
                            jobData.seriesId,
                            [],
                            jobData.coverUrl
                        );
                    }
                } catch (discordError) {
                    logger.error(`Failed to send Discord scraper failure notification: ${discordError}`, { service: 'queueService' });
                }
            }

            // Only mark as failed if all retries are exhausted (for chapter downloads)
            if (isChapterDownloadJobQueue(queueName) && allRetriesExhausted) {
                try {
                    const { mangaProgressService } = await import('@/services/mangaProgressService');
                    const jobData = job?.data;
                    if (jobData?.seriesId && jobData?.chapterNumber) {
                        await mangaProgressService.markFailed(
                            jobData.seriesId, 
                            `Chapter ${jobData.chapterNumber} failed after ${job.attemptsMade} attempts: ${errorMessage}`
                        );
                    }
                } catch (markFailedError) {
                    logger.error(`Failed to mark import as failed: ${markFailedError}`, { service: 'queueService' });
                }
            }
        };

        // Attach listeners with named functions to allow cleanup
        worker.on('completed', onCompleted);
        worker.on('failed', onFailed);

        // Store cleanup function for later
        this.cleanupFunctions.push(async () => {
            try {
                worker.removeListener('completed', onCompleted);
                worker.removeListener('failed', onFailed);
                await worker.close();
                delete this.workers[queueName];
                logger.info(`Worker for queue ${queueName} cleaned up`, { service: 'queueService' });
            } catch (error) {
                logger.error(`Error cleaning up worker for queue ${queueName}: ${error}`, { service: 'queueService' });
            }
        });
    }

    // Clear Queue
    public async clearQueue(queueName: string): Promise<void> {
        const queue = this.getQueue(queueName);
        const time = appConfig.cache.redisCleanupInterval;

        queue.clean(time, 1000, 'completed').then((jobs) => {
            logger.info(`Cleared ${jobs.length} completed jobs from Queue: ${queueName}`, { service: 'queueService' });
        }).catch((error) => {
            logger.error(`Error clearing Queue: ${queueName}: ${error}`, { service: 'queueService' });
        });
    }

    /** Remove all jobs in one state, or every state when `state` is omitted. Returns count removed. */
    public async clearQueueJobs(queueName: string, state?: 'waiting' | 'active' | 'delayed' | 'failed' | 'completed'): Promise<number> {
        const queue = this.getQueue(queueName);
        await queue.waitUntilReady();

        const typesByState: Record<'waiting' | 'active' | 'delayed' | 'failed' | 'completed', ('waiting' | 'prioritized' | 'active' | 'delayed' | 'failed' | 'completed')[]> = {
            waiting: ['waiting', 'prioritized'],
            active: ['active'],
            delayed: ['delayed'],
            failed: ['failed'],
            completed: ['completed'],
        };

        const types = state ? typesByState[state] : Object.values(typesByState).flat();
        let removed = 0;
        for (const type of types) {
            removed += await this.cleanAllJobsOfType(queue, type);
        }

        logger.info(
            `Cleared ${removed} jobs from queue ${queueName}${state ? ` (${state})` : ' (all states)'}`,
            { service: 'queueService' }
        );
        return removed;
    }

    private async cleanAllJobsOfType(queue: Queue, type: 'waiting' | 'prioritized' | 'active' | 'delayed' | 'failed' | 'completed'): Promise<number> {
        let removed = 0;
        for (;;) {
            const batch = await queue.clean(0, 10_000, type);
            removed += batch.length;
            if (batch.length === 0) break;
        }
        return removed;
    }

    // Stop (Pause) all workers for a specific queue
    public async pauseQueue(queueName: string): Promise<void> {
        const queue = this.getQueue(queueName);
        await queue.pause();
        logger.warn(`Queue ${queueName} has been PAUSED`, { service: 'queueService' });
    }

    // Resume all workers for a specific queue
    public async resumeQueue(queueName: string): Promise<void> {
        const queue = this.getQueue(queueName);
        await queue.resume();
        logger.info(`Queue ${queueName} has been RESUMED`, { service: 'queueService' });
    }

    /** BullMQ splits priority jobs into `prioritized`; treat them as waiting for admin metrics. */
    private normalizeJobCounts(counts: Record<string, number>) {
        const waiting = (counts.waiting ?? counts.wait ?? 0) + (counts.prioritized ?? 0);
        return {
            waiting,
            active: counts.active ?? 0,
            completed: counts.completed ?? 0,
            failed: counts.failed ?? 0,
            delayed: counts.delayed ?? 0,
        };
    }

    public async getJob(queueName: string, jobId: string): Promise<Job | undefined> {
        const job = await this.getQueue(queueName).getJob(jobId);
        return job ?? undefined;
    }

    public async retryJob(queueName: string, jobId: string): Promise<void> {
        const job = await this.getJob(queueName, jobId);
        if (!job) throw new Error('Job not found');
        const state = await job.getState();
        if (state !== 'failed') throw new Error('Only failed jobs can be retried');
        await job.retry();
    }

    public async removeJob(queueName: string, jobId: string, opts?: { force?: boolean }): Promise<void> {
        if (opts?.force) {
            await this.forceRemoveJob(queueName, jobId);
            return;
        }
        const job = await this.getJob(queueName, jobId);
        if (!job) throw new Error('Job not found');
        await job.remove();
    }

    /** Remove a job even when BullMQ reports it is locked (stale worker, crashed process, etc.). */
    public async forceRemoveJob(queueName: string, jobId: string): Promise<void> {
        const queue = this.getQueue(queueName);
        await queue.waitUntilReady();
        const job = await this.getJob(queueName, jobId);
        if (!job) throw new Error('Job not found');

        try {
            await job.remove();
            return;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (!message.includes('locked')) throw err;
        }

        logger.warn(`Force-removing locked job ${jobId} from queue ${queueName}`, { service: 'queueService' });

        const state = await job.getState();
        await this.clearJobLockAndLists(queue, jobId, state);

        try {
            await job.remove();
            return;
        } catch (secondErr) {
            const message = secondErr instanceof Error ? secondErr.message : String(secondErr);
            if (!message.includes('locked')) throw secondErr;
        }

        await this.deleteJobRedisRecords(queue, jobId);
    }

    private async clearJobLockAndLists(queue: Queue, jobId: string, state: string): Promise<void> {
        const client = await queue.client;
        const jobKey = queue.toKey(jobId);
        await client.del(`${jobKey}:lock`);
        await client.srem(queue.keys.stalled, jobId);
        if (state === 'active') {
            await client.lrem(queue.keys.active, 0, jobId);
        }
        await client.lrem(queue.keys.wait, 0, jobId);
        await client.lrem(queue.keys.paused, 0, jobId);
        await client.zrem(queue.keys.delayed, jobId);
        await client.zrem(queue.keys.completed, jobId);
        await client.zrem(queue.keys.failed, jobId);
        await client.zrem(queue.keys.prioritized, jobId);
        await client.zrem(queue.keys['waiting-children'], jobId);
    }

    private async deleteJobRedisRecords(queue: Queue, jobId: string): Promise<void> {
        const client = await queue.client;
        const jobKey = queue.toKey(jobId);
        await client.del(
            jobKey,
            `${jobKey}:logs`,
            `${jobKey}:dependencies`,
            `${jobKey}:processed`,
            `${jobKey}:failed`,
            `${jobKey}:unsuccessful`,
            `${jobKey}:lock`,
        );
        await client.srem(queue.keys.stalled, jobId);
        logger.info(`Force-deleted Redis records for job ${jobId} in queue ${queue.name}`, { service: 'queueService' });
    }

    public async promoteJob(queueName: string, jobId: string): Promise<void> {
        const job = await this.getJob(queueName, jobId);
        if (!job) throw new Error('Job not found');
        const state = await job.getState();
        if (state !== 'delayed') throw new Error('Only delayed jobs can be promoted');
        await job.promote();
    }

    // Get detailed stats of the queue
    public async getQueueStatus(queueName: string) {
        const queue = this.getQueue(queueName);
        const [counts, isPaused] = await Promise.all([
            queue.getJobCounts(),
            queue.isPaused()
        ]);
        const normalized = this.normalizeJobCounts(counts as Record<string, number>);

        return {
            queueName,
            status: isPaused ? 'Paused' : 'Active',
            waiting: normalized.waiting,
            active: normalized.active,
            completed: normalized.completed,
            failed: normalized.failed,
            delayed: normalized.delayed
        };
    }

    // Snapshot with oldest waiting age for observability
    public async getQueueSnapshot(queueName: string) {
        const queue = this.getQueue(queueName);
        const [counts, oldest] = await Promise.all([
            queue.getJobCounts(),
            this.getOldestWaiting(queue)
        ]);

        const normalized = this.normalizeJobCounts(counts as Record<string, number>);

        return {
            queueName,
            waiting: normalized.waiting,
            active: normalized.active,
            completed: normalized.completed,
            failed: normalized.failed,
            delayed: normalized.delayed,
            oldestWaitingMs: oldest?.ageMs ?? null,
            oldestWaitingJobId: oldest?.jobId ?? null
        };
    }

    // Close all workers and queues for graceful shutdown
    public async closeAll(): Promise<void> {
        logger.info('Closing all queue workers and connections...', { service: 'queueService' });

        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = undefined;
        }
        
        // Run all cleanup functions
        await Promise.all(this.cleanupFunctions.map(fn => fn()));
        
        // Close all queues
        await Promise.all(Object.values(this.queues).map(queue => queue.close()));
        
        // Disconnect Redis
        await this.redisClient.quit();
        
        logger.info('All queue resources closed', { service: 'queueService' });
    }

    // Periodically log queue metrics for observability (opt-in via config)
    private startQueueMetricsLogging() {
        const interval = appConfig.metrics.queueMetricsIntervalMs;
        this.metricsInterval = setInterval(async () => {
            try {
                for (const queueName of this.getMonitoredQueueNames()) {
                    const queue = this.queues[queueName];
                    // Only report queues that have been instantiated
                    if (!queue) continue;
                    const snapshot = await this.getQueueSnapshot(queueName);
                    logger.info(
                        `[QUEUE][${queueName}] waiting=${snapshot.waiting} active=${snapshot.active} failed=${snapshot.failed} delayed=${snapshot.delayed} oldestWaitingMs=${snapshot.oldestWaitingMs ?? 'n/a'}`,
                        { service: 'queueService' }
                    );
                }
            } catch (error) {
                logger.error(`Failed to log queue metrics: ${error}`, { service: 'queueService' });
            }
        }, interval);

        // Avoid keeping the process alive solely for metrics
        this.metricsInterval.unref();
    }

    private async getOldestWaiting(queue: Queue): Promise<{ ageMs: number; jobId: string | number | undefined } | null> {
        try {
            const jobs = await queue.getJobs(['waiting', 'prioritized'], 0, 0, true);
            const job = jobs.find((j) => j && typeof j.timestamp === 'number');
            if (!job || typeof job.timestamp !== 'number') return null;
            const age = Math.max(0, Date.now() - job.timestamp);
            return { ageMs: age, jobId: job.id };
        } catch (error) {
            logger.warn(`Unable to read oldest waiting job: ${error}`, { service: 'queueService' });
            return null;
        }
    }

    private getMonitoredQueueNames(): string[] {
        return [
            ...Object.keys(appConfig.queues).filter((name) => name !== 'chapterDownload'),
            ...getAllChapterDownloadQueueNames(),
        ];
    }

    // Compute a bounded priority that favors preview chapters first, then spreads series to reduce starvation
    private computeChapterPriority(jobData: any): number {
        const seriesId = Number(jobData?.seriesId);
        const chapterNum = parseFloat(jobData?.chapterNumber);
        const isPreview = Boolean(jobData?.isPreview);

        // BullMQ: lower number = higher priority.
        // Two tiers: preview jobs (0–499,999) run first, then backlog (500,000–1,999,999)
        if (isPreview) {
            // Preview tier: series spread + chapter weight within tier 0–499,999
            const seriesOffset = (seriesId % 1000) * 200;  // 0–199,800
            const chapterOffset = Math.min(199, Math.floor(chapterNum * 10));  // 0–199
            return seriesOffset + chapterOffset;
        } else {
            // Backlog tier: add 500,000 base, then series spread + chapter weight
            const BASE = 500_000;
            const seriesOffset = (seriesId % 1000) * 200;  // 0–199,800
            const chapterOffset = Math.min(199, Math.floor(chapterNum * 10));  // 0–199
            return BASE + seriesOffset + chapterOffset;
        }
    }

}

export const queueService = new QueueService();