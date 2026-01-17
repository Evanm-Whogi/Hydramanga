import { Request, Response, NextFunction } from 'express';
import { queueService } from '@/services/queueService';
import path from 'path';
import logger from '@/services/loggerService';
import dotenv from 'dotenv';
dotenv.config();


export const importStatus = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    const queue = queueService.getQueue('mangaImportQueue');
    const activeJobs = await queue.getActive();
    
    if (activeJobs.length === 0) {
        return res.json({ status: 'idle' });
    }

    const job = activeJobs[0];
    res.json({
        status: 'processing',
        progress: job.progress,
        id: job.id,
        timestamp: job.timestamp
    });
}

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

        const filePath = path.resolve(process.cwd(), 'src/series.json');

        const job = await queueService.addJob('mangaImportQueue', 'fullSync', { 
            filePath,
            triggeredBy: 'admin_api' 
        });

        logger.info(`Manga sync triggered manually: Job ID ${job.id}`);

        return res.status(202).json({
            message: 'Sync job accepted and queued',
            jobId: job.id
        });
    } catch (error: any) {
        logger.error(`Failed to trigger sync: ${error.message}`);
        return res.status(500).json({ error: 'Internal Server Error' });
    }

}