/**
 * Manga Import Job Handler
 * Processes metadata import jobs from bulk JSON files
 */
import { IJobHandler } from './IJobHandler';
import { mangaImporterService } from '@/services/mangaImporterService';
import { Job } from 'bullmq';
import logger from '@/services/loggerService';
import * as Sentry from "@sentry/node";
import { withTransaction, setJobContext, captureError } from '@/utils/sentryHelper';

export class MangaImportJobHandler implements IJobHandler {
  canHandle(queueName: string): boolean {
    return queueName === 'mangaImportQueue';
  }

  async handle(data: any, job?: Job): Promise<void> {
    try {
      await withTransaction(
        `manga_import_${job?.id || 'manual'}`,
        async () => {
          setJobContext('import', {
            job_id: job?.id,
            file_path: data.filePath,
            job_name: job?.name,
          });

          logger.info(`Processing manga import job with file: ${data.filePath}`, { service: 'mangaImportJobHandler' });
          
          await mangaImporterService.fullSyncManga(data.filePath, job);
        },
        {
          op: "job.import",
          tags: {
            job_type: "manga_import",
            file_path: data.filePath,
          },
        }
      );
    } catch (error) {
      logger.error(`Manga import job handler failed: ${error}`, { service: 'mangaImportJobHandler' });
      
      captureError(error, {
        tags: {
          job_type: "manga_import",
          job_id: job?.id || "unknown",
        },
        data: {
          file_path: data.filePath,
          attempts: job?.attemptsMade || 0,
        },
      });

      throw error;
    }
  }
}

