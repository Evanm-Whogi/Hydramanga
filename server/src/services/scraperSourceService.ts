import { db } from '@/db';
import { mangaImportProgress, series } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { scraperManager } from '@/scrapers';
import { scraperTitleOptions } from '@/lib/catalogTitles';
import { resolveDisplayTitle } from '@/lib/displayTitle';
import { mangaProgressService } from '@/services/mangaProgressService';
import logger from '@/services/loggerService';

const DEFAULT_MIN_SCORE = 50;

export type AutoSelectScraperSourceResult = {
  selected: boolean;
  reason?: 'already_set' | 'no_title' | 'no_match' | 'score_too_low';
  scraperId?: string;
  scraperUrl?: string;
  score?: number;
};

function getMinAutoSourceScore(): number {
  const env = Number(process.env.AUTO_SOURCE_MIN_SCORE);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_MIN_SCORE;
}

/** Pick best scraper source via cross-scraper title scoring (same logic as chapter scans). */
export async function autoSelectScraperSource(seriesId: number): Promise<AutoSelectScraperSourceResult> {
  const [progress] = await db
    .select({ scraperId: mangaImportProgress.scraperId, scraperUrl: mangaImportProgress.scraperUrl })
    .from(mangaImportProgress)
    .where(eq(mangaImportProgress.seriesId, seriesId))
    .limit(1);

  if (progress?.scraperId?.trim() && progress?.scraperUrl?.trim()) {
    return { selected: false, reason: 'already_set', scraperId: progress.scraperId, scraperUrl: progress.scraperUrl };
  }

  const [row] = await db
    .select({ titles: series.titles })
    .from(series)
    .where(eq(series.id, seriesId))
    .limit(1);

  const mangaName = row ? resolveDisplayTitle(row).trim() : '';
  if (!mangaName) {
    return { selected: false, reason: 'no_title' };
  }

  const titleOpts = scraperTitleOptions(row?.titles);
  const best = await scraperManager.findBestMatch(mangaName, {
    seriesId,
    romanizedTitle: titleOpts.romanizedTitle,
    nativeTitle: titleOpts.nativeTitle,
    secondaryTitles: titleOpts.secondaryTitles.length > 0 ? titleOpts.secondaryTitles : undefined,
  });

  if (!best) {
    logger.info(`No scraper match for series ${seriesId} ("${mangaName}")`, { service: 'scraperSourceService' });
    return { selected: false, reason: 'no_match' };
  }

  const minScore = getMinAutoSourceScore();
  if (best.result.score < minScore) {
    logger.info(
      `Best match for series ${seriesId} below min score (${best.result.score} < ${minScore}): "${best.result.title}"`,
      { service: 'scraperSourceService' }
    );
    return { selected: false, reason: 'score_too_low', score: best.result.score };
  }

  const scraperId = best.scraper.getMetadata().id;
  await mangaProgressService.setScraperMatch(seriesId, scraperId, best.result.href);

  logger.info(
    `Auto-selected source for series ${seriesId}: ${scraperId} "${best.result.title}" (score ${best.result.score})`,
    { service: 'scraperSourceService' }
  );

  return {
    selected: true,
    scraperId,
    scraperUrl: best.result.href,
    score: best.result.score,
  };
}
