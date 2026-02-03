/**
 * Manga Chapter Import Job Handler
 * Processes chapter discovery jobs
 */
import { IJobHandler } from './IJobHandler';
import { ChapterScannerService } from '@/services/chapterScannerService';
import logger from '@/services/loggerService';
import * as Sentry from "@sentry/node";
import { withTransaction, setJobContext, captureError } from '@/utils/sentryHelper';

export class MangaChapterImportJobHandler implements IJobHandler {
  canHandle(queueName: string): boolean {
    return queueName === 'mangaChapterImportQueue';
  }

  async handle(data: any): Promise<void> {
    try {
      await withTransaction(
        `chapter_scan_${data.seriesId}`,
        async () => {
          setJobContext('chapter_scan', {
            series_id: data.seriesId,
            manga_title: data.mangaTitle,
            is_first_scan: data.isFirstScan || false,
            romanized_title: data.romanizedTitle,
          });

          logger.info(`Processing chapter scan for manga: ${data.mangaTitle} (series ID: ${data.seriesId})`, { service: 'mangaChapterImportJobHandler' });
          
          await ChapterScannerService.scanForNewChapters(
            data.mangaTitle,
            data.seriesId,
            data.romanizedTitle,
            data.isFirstScan
          );
        },
        {
          op: "job.chapter_scan",
          tags: {
            job_type: "chapter_scan",
            series_id: String(data.seriesId),
            manga_title: data.mangaTitle,
          },
        }
      );
    } catch (error) {
      logger.error(`Manga chapter import job handler failed: ${error}`, { service: 'mangaChapterImportJobHandler' });
      
      captureError(error, {
        tags: {
          job_type: "chapter_scan",
          series_id: String(data.seriesId),
        },
        data: {
          manga_title: data.mangaTitle,
          is_first_scan: data.isFirstScan || false,
        },
      });

      throw error;
    }
  }
}
