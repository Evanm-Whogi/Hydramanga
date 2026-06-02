import { Request, Response, NextFunction } from 'express';
import { queueService } from '@/services/queueService';
import { mangaOrchestratorService } from '@/services/mangaOrchestratorService';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { extract } from 'tar';
import axios from 'axios';
import logger from '@/services/loggerService';
import dotenv from 'dotenv';
dotenv.config();

// Get current import status
export const importStatus = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    try {
        const queue = queueService.getQueue('mangaImportQueue');
        logger.info('Fetching active jobs from mangaImportQueue', { service: 'mangaImportController' });
        
        const activeJobs = await queue.getActive();
        logger.info(`Active jobs count: ${activeJobs.length}`, { service: 'mangaImportController' });
        
        if (activeJobs.length === 0) {
            logger.debug('No active jobs, checking waiting jobs', { service: 'mangaImportController' });
            const waitingJobs = await queue.getWaiting();
            logger.debug(`Waiting jobs count: ${waitingJobs.length}`, { service: 'mangaImportController' });
            return res.json({ status: 'idle', activeJobs: 0, waitingJobs: waitingJobs.length });
        }
        
        const job = activeJobs[0];
        logger.info(`Job active: ${job.id}, progress: ${job.progress}%`, { service: 'mangaImportController' });
        
        res.json({
            status: 'processing',
            progress: job.progress,
            id: job.id,
            timestamp: job.timestamp
        });
    } catch (error: any) {
        logger.error(`Error in importStatus: ${error.message}`, { service: 'mangaImportController', stack: error.stack });
        return res.status(500).json({ status: 'error', message: error.message });
    }
}

// Trigger manga metadata sync manually
export const triggerMangaSync = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    try {
        const queue = queueService.getQueue('mangaImportQueue');

        const activeJobs = await queue.getActive();
        const waitingJobs = await queue.getWaiting();

        if (activeJobs.length > 0 || waitingJobs.length > 0) {
            return res.status(409).json({ 
                message: 'A sync job is already in progress or queued.',
                jobId: activeJobs[0]?.id || waitingJobs[0]?.id
            });
        }

        // Respond immediately that the job is being prepared
        res.status(202).json({
            message: 'Sync job accepted - downloading and preparing database...',
            status: 'preparing'
        });

        // Download and extract SQLite database asynchronously
        const downloadDir = path.resolve(process.cwd(), '../data', 'imports');
        const tarGzPath = path.join(downloadDir, 'series.sqlite.tar.gz');
        const extractedPath = path.join(downloadDir, 'series.sqlite');

        try {
            // Ensure download directory exists
            await fs.mkdir(downloadDir, { recursive: true });
            
            // Download the tar.gz file
            logger.info('[MANUAL SYNC] Downloading series.sqlite.tar.gz...', { service: 'mangaImportController' });
            const response = await axios.get('https://api.mangabaka.dev/v1/database/series.sqlite.tar.gz', {
                responseType: 'stream',
                timeout: 300000 // 5 minute timeout for large file
            });
            
            // Save tar.gz to disk
            await pipeline(
                response.data,
                createWriteStream(tarGzPath)
            );
            logger.info('[MANUAL SYNC] Downloaded series.sqlite.tar.gz successfully', { service: 'mangaImportController' });
            
            // Extract tar.gz
            logger.info('[MANUAL SYNC] Extracting tar.gz...', { service: 'mangaImportController' });
            await extract({
                file: tarGzPath,
                cwd: downloadDir,
                filter: (filePath) => filePath.endsWith('.sqlite') // Only extract .sqlite files
            });
            
            // Verify extracted file exists
            try {
                await fs.access(extractedPath);
                const stats = await fs.stat(extractedPath);
                logger.info(`[MANUAL SYNC] Extraction successful, SQLite file ready (${(stats.size / 1024 / 1024).toFixed(2)} MB)`, { service: 'mangaImportController' });
            } catch {
                throw new Error('SQLite file not found after extraction');
            }
            
            // Clean up tar.gz
            await fs.unlink(tarGzPath).catch(() => {});
            
            // Queue the import job
            const job = await queueService.addJob('mangaImportQueue', 'fullSync', { 
                filePath: extractedPath,
                triggeredBy: 'admin_api' 
            });

            logger.info(`[MANUAL SYNC] Manga sync queued: Job ID ${job.id}`, { service: 'mangaImportController' });
            
        } catch (error: any) {
            logger.error('[MANUAL SYNC] Failed to download/extract series database', { service: 'mangaImportController', error });
            // Clean up partial files on error
            await fs.unlink(tarGzPath).catch(() => {});
            await fs.unlink(extractedPath).catch(() => {});
            throw error;
        }

    } catch (error: any) {
        logger.error(`Failed to trigger sync: ${error.message}`, { service: 'mangaImportController' });
        // If response was already sent, we can't send another one
        if (!res.headersSent) {
            return res.status(500).json({ error: 'Internal Server Error', message: error.message });
        }
    }

}

// Trigger monitored manga rescan (rescans all manga with chapters)
export const triggerMonitoredRescan = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    try {
        logger.info('Monitored rescan triggered manually via admin API', { service: 'mangaImportController' });
        
        // Trigger the monitored rescan asynchronously
        mangaOrchestratorService.enqueueMonitoredRescans().catch(error => {
            logger.error(`Error during monitored rescan: ${error.message}`, { service: 'mangaImportController' });
        });

        return res.status(202).json({
            message: 'Monitored rescan jobs queued for all manga with chapters',
            description: 'This will scan all non-trending manga that have existing chapters for new updates'
        });
    } catch (error: any) {
        logger.error(`Failed to trigger monitored rescan: ${error.message}`, { service: 'mangaImportController' });
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

export const triggerTrendingRescan = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    try {
        const trendingLimit = Number(process.env.TRENDING_LIMIT) || 100;
        logger.info(`Trending rescan triggered manually via admin API for top ${trendingLimit} manga`, { service: 'mangaImportController' });
        
        // Trigger the trending rescan asynchronously
        mangaOrchestratorService.enqueueTrendingChapterScans(trendingLimit).catch(error => {
            logger.error(`Error during trending rescan: ${error.message}`, { service: 'mangaImportController' });
        });

        return res.status(202).json({
            message: `Trending rescan jobs queued for top ${trendingLimit} manga`,
            description: 'This will scan the most popular manga for new chapters'
        });
    } catch (error: any) {
        logger.error(`Failed to trigger trending rescan: ${error.message}`, { service: 'mangaImportController' });
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

function parseRankedScanQuery(req: Request): { start: number; end: number; skipWithChapters: boolean; autoSelectSource: boolean; type?: string } | { error: string } {
    const start = Number(req.query.start);
    const end = Number(req.query.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) {
        return { error: 'Query params start and end are required (1-based inclusive ranks, e.g. start=100&end=200)' };
    }
    const skipWithChapters = req.query.skipWithChapters === 'true' || req.query.skipWithChapters === '1';
    const autoSelectSource = req.query.autoSelectSource !== 'false' && req.query.autoSelectSource !== '0';
    const type = typeof req.query.type === 'string' && req.query.type.trim() ? req.query.type.trim() : undefined;
    return { start: Math.floor(start), end: Math.floor(end), skipWithChapters, autoSelectSource, type };
}

export const triggerRankedScan = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    try {
        const parsed = parseRankedScanQuery(req);
        if ('error' in parsed) {
            return res.status(400).json({ error: parsed.error });
        }

        const { start, end, skipWithChapters, autoSelectSource, type } = parsed;
        if (end - start + 1 > 500) {
            return res.status(400).json({ error: 'Maximum 500 ranks per batch (end - start + 1 <= 500)' });
        }

        logger.info(
            `Ranked chapter scan triggered via admin API (ranks ${start}-${end}, skipWithChapters=${skipWithChapters}, autoSelectSource=${autoSelectSource}${type ? `, type=${type}` : ''})`,
            { service: 'mangaImportController' }
        );

        mangaOrchestratorService.enqueueRankedChapterScans({ start, end, skipWithChapters, autoSelectSource, type }).then((result) => {
            logger.info(
                `Ranked scan batch ${start}-${end} finished: ${result.queued} queued, ${result.sourcesSelected} sources selected`,
                { service: 'mangaImportController' }
            );
        }).catch((error) => {
            logger.error(`Error during ranked scan ${start}-${end}: ${error.message}`, { service: 'mangaImportController' });
        });

        return res.status(202).json({
            message: `Ranked scan accepted for global ranks ${start}-${end}`,
            description: 'Queues chapter scans for the global weighted-score rank range. skipWithChapters skips individual titles but does not shift ranks. When autoSelectSource is on, each queued title gets a scraper source via cross-scraper title matching (score + priority) before its scan job runs.',
            start,
            end,
            skipWithChapters,
            autoSelectSource,
            type: type ?? 'all',
        });
    } catch (error: any) {
        logger.error(`Failed to trigger ranked scan: ${error.message}`, { service: 'mangaImportController' });
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}