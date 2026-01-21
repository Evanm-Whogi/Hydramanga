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

class QueueService {
    private queues: { [key: string]: Queue } = {};
    private workers: { [key: string]: Worker } = {};
    private redisConnection: any;
    private redisClient: Redis;

    constructor() {
      this.redisConnection = appConfig.redis;
      this.redisClient = new Redis(this.redisConnection);
      logger.info(`QueueService initialized with Redis connection: ${this.redisConnection.host}:${this.redisConnection.port}`, { service: 'queueService' });
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
            this.createWorker(queueName);
        }
        return this.queues[queueName];
    }

    // Add Job to Queue
    public addJob: queueJobFunction = async (queueName, jobName, jobData, options = {}) => {
        const queue = this.getQueue(queueName);
        
        // For chapter download queue, prioritize by series FIRST, then by chapter number
        // BullMQ max priority is 2,097,152
        // Each series gets its own 100,001-point range to prevent overlap and interleaving
        // Priority = (seriesId % 20) * 100,001 + (100,000 - chapterNumber * 100)
        // This ensures ALL chapters of Series A complete before ANY chapter of Series B starts
        let priority = 0;
        if (queueName === 'mangaChapterDownloadQueue' && jobData.seriesId && jobData.chapterNumber) {
            const seriesId = jobData.seriesId;
            const chapterNum = parseFloat(jobData.chapterNumber);
            
            // Each series gets a distinct 100,001-point range
            // (0-100,000 for series 0, 100,001-200,001 for series 1, etc.)
            // Max: (19 * 100,001) + 100,000 = 1,999,219 (safely under 2,097,152)
            const seriesPriority = (seriesId % 20) * 100001;
            const chapterPriority = Math.max(0, 100000 - (chapterNum * 100));
            priority = seriesPriority + chapterPriority;
        }
        
        // Default cleanup so queues do not bloat
        const job = await queue.add(jobName, jobData, {
            removeOnComplete: true,
            removeOnFail: 25,
            attempts: 3,
            backoff: { type: 'exponential', delay: 30000 },
            timeout: 15 * 60 * 1000, // 15 minute timeout per job (increased from 5 to allow retries)
            priority: priority,
            ...options
        });
        return job;
    }

    // Create Worker
    private createWorker(queueName: string) {
        // Skip if worker already exists for this queue
        if (this.workers[queueName]) {
            return;
        }

        const limiter = { max: 10, duration: 1000 };  // Standard global limit
        
        // Get queue-specific configuration
        let concurrency = 1;
        let timeout = 15 * 60 * 1000;
        
        const queueConfig = appConfig.queues[queueName as keyof typeof appConfig.queues];
        if (queueConfig) {
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
            concurrency: concurrency
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

            // Only mark as failed if all retries are exhausted (for chapter downloads)
            if (queueName === 'mangaChapterDownloadQueue' && 
                job?.attemptsMade >= (job?.opts?.attempts || 3)) {
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

        // Graceful shutdown handler
        const cleanup = async () => {
            try {
                worker.removeListener('completed', onCompleted);
                worker.removeListener('failed', onFailed);
                await worker.close();
                delete this.workers[queueName];
                logger.info(`Worker for queue ${queueName} cleaned up`, { service: 'queueService' });
            } catch (error) {
                logger.error(`Error cleaning up worker for queue ${queueName}: ${error}`, { service: 'queueService' });
            }
        };

        // Attach cleanup to process exit
        process.on('exit', cleanup);
        process.on('SIGTERM', cleanup);
        process.on('SIGINT', cleanup);
    }

    // Clear Queue
    public async clearQueue(queueName: string): Promise<void> {
        const queue = this.getQueue(queueName);
        const time = appConfig.cache.redisCleanupInterval;

        queue.clean(time, 'completed' as any).then((jobs) => {
            logger.info(`Cleared ${jobs} completed jobs from Queue: ${queueName}`, { service: 'queueService' });
        }).catch((error) => {
            logger.error(`Error clearing Queue: ${queueName}: ${error}`, { service: 'queueService' });
        });
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

    // Get detailed stats of the queue
    public async getQueueStatus(queueName: string) {
        const queue = this.getQueue(queueName);
        const [counts, isPaused] = await Promise.all([
            queue.getJobCounts(),
            queue.isPaused()
        ]);

        return {
            queueName,
            status: isPaused ? 'Paused' : 'Active',
            waiting: counts.waiting,
            active: counts.active,
            completed: counts.completed,
            failed: counts.failed,
            delayed: counts.delayed
        };
    }

}

export const queueService = new QueueService();