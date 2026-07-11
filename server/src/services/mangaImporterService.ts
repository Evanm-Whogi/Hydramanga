// Manga Importer Service
// Imports manga data from SQLite source database into Postgres destination database
// Efficiently handles large datasets with streaming and delta updates
// This entire file is written by AI so should be interesting to review for quality assurance

import fs from 'fs';
import { pool } from '@/db/index';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import crypto from 'crypto';
import { Job } from 'bullmq';
import logger from '@/services/loggerService';
import { discordService } from '@/services/discordService';
import path from 'path';
import Database from 'better-sqlite3';
import * as Sentry from "@sentry/node";
import { withSpan, addBreadcrumb, captureError } from '@/utils/sentryHelper';
import { invalidateCatalogCaches } from '@/lib/catalogCache';
import { from as copyFrom } from 'pg-copy-streams';

const POPULARITY_HISTORY_WINDOWS = ['1d', '1w', '1mo', '3mo', '6mo', '1y'] as const;
const RELATIONSHIP_TYPES = ['adaptation', 'alternative', 'side_story', 'prequel', 'sequel', 'spin_off', 'main_story', 'other'] as const;
const SOURCE_PROVIDERS = ['anilist', 'anime_planet', 'shikimori', 'anime_news_network', 'manga_updates', 'my_anime_list', 'kitsu'] as const;
const RESPONSIVE_SIZES = ['x150', 'x250', 'x350'] as const;
const PROGRESS_LOG_INTERVAL = 5000;
const PROGRESS_UPDATE_INTERVAL = 10000;

type SeriesRow = Record<string, any>;

class MangaImporterService {
  private parseJSON(value: unknown): any {
    if (!value || typeof value !== 'string') return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private buildTitles(row: SeriesRow): string | null {
    const raw = this.parseJSON(row.titles);
    if (Array.isArray(raw) && raw.length > 0) return JSON.stringify(raw);

    const entries: Record<string, unknown>[] = [];
    if (row.title?.trim()) entries.push({ language: 'en', title: row.title.trim(), is_primary: true, traits: [] });
    if (row.native_title?.trim()) entries.push({ language: 'ja', title: row.native_title.trim(), is_primary: true, traits: ['native'] });
    if (row.romanized_title?.trim()) entries.push({ language: 'ja-Latn', title: row.romanized_title.trim(), is_primary: true, traits: ['native'] });
    return entries.length ? JSON.stringify(entries) : null;
  }

  private buildPublished(row: SeriesRow): string | null {
    if (!row.published_start_date && !row.published_end_date) return null;
    return JSON.stringify({
      start_date: row.published_start_date ?? null,
      end_date: row.published_end_date ?? null,
      start_date_is_estimated: row.published_start_date_is_estimated == null ? null : Boolean(Number(row.published_start_date_is_estimated)),
      end_date_is_estimated: row.published_end_date_is_estimated == null ? null : Boolean(Number(row.published_end_date_is_estimated)),
    });
  }

  private buildPopularityHistory(row: SeriesRow, prefix: string): Record<string, number> | null {
    const history = POPULARITY_HISTORY_WINDOWS.reduce((acc, window) => {
      const value = row[`${prefix}_history_${window}`];
      if (value != null && value !== '') acc[window] = Number(value);
      return acc;
    }, {} as Record<string, number>);
    return Object.keys(history).length ? history : null;
  }

  private buildPopularity(row: SeriesRow): string | null {
    const raw = this.parseJSON(row.popularity);
    if (raw && typeof raw === 'object') return JSON.stringify(raw);

    const globalCurrent = row.popularity_global_current;
    const typeCurrent = row.popularity_type_current;
    if (globalCurrent == null && typeCurrent == null) return null;

    const popularity: Record<string, any> = {};
    if (globalCurrent != null) {
      const global: Record<string, any> = { current: Number(globalCurrent) };
      const history = this.buildPopularityHistory(row, 'popularity_global');
      if (history) global.history = history;
      popularity.global = global;
    }
    if (typeCurrent != null) {
      const type: Record<string, any> = { current: Number(typeCurrent) };
      const history = this.buildPopularityHistory(row, 'popularity_type');
      if (history) type.history = history;
      popularity.type = type;
    }
    return JSON.stringify(popularity);
  }

  private extractPopularityCurrents(popularityJson: string | null): { global: number | null; type: number | null } {
    if (!popularityJson) return { global: null, type: null };
    try {
      const parsed = JSON.parse(popularityJson) as Record<string, { current?: unknown } | undefined>;
      const toRank = (value: unknown) => (value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null);
      return { global: toRank(parsed.global?.current), type: toRank(parsed.type?.current) };
    } catch {
      return { global: null, type: null };
    }
  }
  
  private buildResponsiveImage(row: SeriesRow, size: string): Record<string, string | null> | null {
    const x1 = row[`cover_${size}_x1`];
    const x2 = row[`cover_${size}_x2`];
    const x3 = row[`cover_${size}_x3`];
    
    if (!x1 && !x2 && !x3) return null;
    return { x1: x1 || null, x2: x2 || null, x3: x3 || null };
  }

  private buildCover(row: SeriesRow): string | null {
    if (!row.cover_raw_url) return null;
    
    const cover: Record<string, any> = {
      raw: {
        url: row.cover_raw_url,
        size: row.cover_raw_size ?? null,
        height: row.cover_raw_height ?? null,
        width: row.cover_raw_width ?? null,
        blurhash: row.cover_raw_blurhash ?? null,
        thumbhash: row.cover_raw_thumbhash ?? null,
        format: row.cover_raw_format ?? null
      }
    };
    
    for (const size of RESPONSIVE_SIZES) {
      const responsive = this.buildResponsiveImage(row, size);
      if (responsive) cover[size] = responsive;
    }
    
    return JSON.stringify(cover);
  }
  
  private buildAnime(row: SeriesRow): string | null {
    if (row.anime) return row.anime;
    if (!row.anime_start && !row.anime_end) return null;
    
    const anime: Record<string, string> = {};
    if (row.anime_start) anime.start = row.anime_start;
    if (row.anime_end) anime.end = row.anime_end;
    
    return JSON.stringify(anime);
  }
  
  private buildRelationships(row: SeriesRow): string | null {
    const rels = RELATIONSHIP_TYPES.reduce((acc, type) => {
      const parsed = this.parseJSON(row[`relationships_${type}`]);
      if (parsed) acc[type] = parsed;
      return acc;
    }, {} as Record<string, any>);
    
    return Object.keys(rels).length ? JSON.stringify(rels) : null;
  }
  
  private buildSource(row: SeriesRow): string | null {
    const source = SOURCE_PROVIDERS.reduce((acc, provider) => {
      const fields = ['id', 'rating', 'rating_normalized', 'cover', 'last_updated_at', 'response'] as const;
      const obj = fields.reduce((providerObj, field) => {
        const value = row[`source_${provider}_${field}`];
        if (value) providerObj[field] = value;
        return providerObj;
      }, {} as Record<string, any>);
      
      if (Object.keys(obj).length) acc[provider] = obj;
      return acc;
    }, {} as Record<string, any>);
    
    return Object.keys(source).length ? JSON.stringify(source) : null;
  }
  
  private formatCSVValue(value: any, isNumeric: boolean = false, isJsonb: boolean = false): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' && value.trim().toLowerCase() === 'null') return '';
    
    if (isNumeric) {
      return typeof value === 'boolean' ? String(value) : String(value);
    }
    
    if (isJsonb) {
      if (!value) return '';
      
      const jsonStr = typeof value === 'string' ? value.trim() : JSON.stringify(value);
      if (!jsonStr) return '';
      
      // Validate JSON and escape for CSV
      try {
        JSON.parse(jsonStr);
        return `"${jsonStr.replace(/"/g, '""')}"`;
      } catch {
        return '';
      }
    }
    
    return `"${String(value).replace(/"/g, '""')}"`;
  }
  
  private buildCSVRow(row: SeriesRow, hash: string): string {
    const txt = (v: any) => this.formatCSVValue(v);
    const num = (v: any) => this.formatCSVValue(v, true);
    const json = (v: any) => this.formatCSVValue(v, false, true);
    const popularityJson = this.buildPopularity(row);
    const popularityCurrents = this.extractPopularityCurrents(popularityJson);
    const globalCurrent = popularityCurrents.global ?? (row.popularity_global_current != null ? Number(row.popularity_global_current) : null);
    const typeCurrent = popularityCurrents.type ?? (row.popularity_type_current != null ? Number(row.popularity_type_current) : null);

    return [
      num(row.id), txt(row.state), num(row.merged_with), json(this.buildTitles(row)), json(this.buildCover(row)),
      json(row.authors), json(row.artists), txt(row.description),
      num(row.year), json(this.buildPublished(row)), json(popularityJson),
      num(globalCurrent), num(typeCurrent),
      txt(row.status), num(row.is_licensed), num(row.has_anime),
      json(this.buildAnime(row)), txt(row.content_rating), txt(row.type),
      num(row.rating), num(null),
      txt(row.final_volume), txt(row.final_chapter), txt(row.total_chapters),
      json(row.links), json(row.links_v2), json(row.publishers),
      json(this.buildRelationships(row)), json(row.relationships_v2),
      json(row.genres), json(row.genres_v2), json(row.tags), json(row.tags_v2),
      txt(row.last_updated_at), json(this.buildSource(row)), txt(hash)
    ].join('|') + '\n';
  }
  
  private computeHash(row: SeriesRow): string {
    const mutableFields = [
      row.state, row.merged_with, row.titles, row.description,
      row.status, row.rating, row.final_chapter, row.total_chapters,
      row.published_start_date, row.published_end_date,
      row.popularity, row.popularity_global_current, row.popularity_type_current,
      row.links_v2, row.relationships_v2, row.tags_v2, row.genres_v2,
      row.last_updated_at, this.buildSource(row),
    ];
    return crypto.createHash('md5').update(JSON.stringify(mutableFields)).digest('hex');
  }

  public async fullSyncManga(filePath: string, job?: Job) {
    const client = await pool.connect();
    const fileName = path.basename(filePath);
    const startTime = Date.now();
    let sqliteDb: Database.Database | null = null;
    let processed = 0;
    
    try {
      // Verify SQLite file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`SQLite database not found: ${filePath}`);
      }

      sqliteDb = new Database(filePath, { readonly: true, fileMustExist: true });
      
      // Get total count
      const countResult = sqliteDb.prepare('SELECT COUNT(*) as count FROM series').get() as { count: number };
      const totalRecords = countResult.count;
      
      Sentry.addBreadcrumb({
        message: 'Import initialized',
        level: 'info',
        data: { file_name: fileName, total_records: totalRecords },
      });

      await discordService.notifyImportStarted(fileName);
      logger.info(`Starting import: ${totalRecords.toLocaleString()} records from ${fileName}`);
      
      // 1. START TRANSACTION WITH OPTIMIZATIONS
      await withSpan(
        'setup_transaction',
        async () => {
          await client.query('BEGIN');
          await client.query("SET LOCAL work_mem = '512MB'");
          await client.query("SET LOCAL maintenance_work_mem = '1GB'");
          await client.query("SET LOCAL synchronous_commit = 'off'");
          await client.query("SET LOCAL random_page_cost = 1.1");
        },
        { op: 'db.setup', tags: { step: 'transaction_setup' } }
      );
      
      if (job) await job.updateProgress(5);

      // 2. CREATE TEMP STAGING TABLE
      await withSpan(
        'create_staging_table',
        async () => {
          await client.query(`
            CREATE TEMP TABLE staging_series (
              id INT, state TEXT, merged_with INT, titles JSONB, cover JSONB, authors JSONB, 
              artists JSONB, description TEXT, year INT, published JSONB, popularity JSONB,
              popularity_global_current INT, popularity_type_current INT, status TEXT, is_licensed BOOLEAN, 
              has_anime BOOLEAN, anime JSONB, content_rating TEXT, type TEXT, rating REAL, 
              weighted_score REAL, final_volume TEXT, final_chapter TEXT, total_chapters TEXT, links JSONB, 
              links_v2 JSONB, publishers JSONB, relationships JSONB, relationships_v2 JSONB,
              genres JSONB, genres_v2 JSONB, tags JSONB, tags_v2 JSONB, last_updated_at TIMESTAMPTZ, source JSONB, content_hash TEXT
            ) ON COMMIT PRESERVE ROWS;
          `);
          logger.info('Staging table created');
        },
        { op: 'db.schema', tags: { step: 'staging_table' } }
      );

      // 3. STREAM DATA VIA COPY
      logger.info('Starting COPY stream...');
      const copyStream = client.query(copyFrom(`
        COPY staging_series FROM STDIN WITH (FORMAT csv, DELIMITER '|', QUOTE '"')
      `));
      
      if (job) await job.updateProgress(10);
      
      let processed = 0;
      let firstRowLogged = false;
      
      // Create async generator that transforms SQLite rows to CSV
      const dataGenerator = async function* (this: MangaImporterService) {
        const stmt = sqliteDb!.prepare('SELECT * FROM series');
        
        for (const rawRow of stmt.iterate()) {
          const row = rawRow as SeriesRow;
          
          // Compute hash for change detection
          const hash = this.computeHash(row);
          
          // Build CSV row
          const csvRow = this.buildCSVRow(row, hash);
          
          processed++;
          
          // First row diagnostics
          if (!firstRowLogged) {
            firstRowLogged = true;
            logger.info('First row from SQLite:', {
              id: row.id,
              title: row.title?.substring(0, 50),
              has_cover_url: !!row.cover_raw_url,
              built_cover_len: this.buildCover(row)?.length || 0,
              built_titles_len: this.buildTitles(row)?.length || 0,
              built_source_len: this.buildSource(row)?.length || 0,
              built_relationships_len: this.buildRelationships(row)?.length || 0,
              genres_v2_len: row.genres_v2?.length || 0
            });
          }
          
          // Progress logging
          if (processed % PROGRESS_LOG_INTERVAL === 0) {
            const progress = Math.min(10 + Math.round((processed / totalRecords) * 80), 90);
            const rate = Math.round(processed / (Date.now() - startTime) * 1000);
            logger.info(`Import: ${processed.toLocaleString()}/${totalRecords.toLocaleString()} (${progress}%) - ${rate} rows/sec`);
            
            if (job && processed % PROGRESS_UPDATE_INTERVAL === 0) {
              await job.updateProgress(progress);
            }
          }
          
          yield csvRow;
        }
        
        logger.info(`Finished streaming ${processed.toLocaleString()} rows`);
      }.bind(this);
      
      // Execute pipeline
      const sourceStream = Readable.from(dataGenerator());
      
      sourceStream.on('error', (err) => {
        logger.error('Source error:', err);
        addBreadcrumb('Stream source error during COPY', 'error', { error: String(err) });
      });
      copyStream.on('error', (err) => {
        logger.error('COPY error:', err);
        addBreadcrumb('COPY stream error', 'error', { error: String(err) });
      });
      
      await withSpan(
        'copy_stream_data',
        async () => pipeline(sourceStream, copyStream),
        { op: 'db.copy', tags: { step: 'stream_copy', rows: String(processed) } }
      );
      logger.info('COPY completed');

      // 4. INDEX STAGING TABLE
      logger.info('Creating indexes...');
      if (job) await job.updateProgress(91);
      
      await withSpan(
        'create_staging_indexes',
        async () => {
          await client.query(`CREATE INDEX idx_staging_id ON staging_series(id)`);
          if (job) await job.updateProgress(92);
          
          await client.query(`CREATE INDEX idx_staging_hash ON staging_series(content_hash)`);
          if (job) await job.updateProgress(93);
          
          logger.info('Indexes created');
        },
        { op: 'db.index', tags: { step: 'indexes' } }
      );

      // 5. DELTA UPDATE
      logger.info('Performing delta update...');
      const updateResult = await withSpan(
        'delta_update_existing',
        async () => {
          return await client.query(`
            UPDATE series s SET 
              state = st.state, 
              merged_with = st.merged_with,
              titles = st.titles,
              cover = st.cover,
              authors = st.authors,
              artists = st.artists,
              description = st.description,
              year = st.year,
              published = st.published,
              popularity = st.popularity,
              popularity_global_current = st.popularity_global_current,
              popularity_type_current = st.popularity_type_current,
              status = st.status,
              is_licensed = st.is_licensed,
              has_anime = st.has_anime,
              anime = st.anime,
              content_rating = st.content_rating,
              type = st.type,
              rating = st.rating,
              final_volume = st.final_volume,
              final_chapter = st.final_chapter,
              total_chapters = st.total_chapters,
              links = st.links,
              links_v2 = st.links_v2,
              publishers = st.publishers,
              relationships = st.relationships,
              relationships_v2 = st.relationships_v2,
              genres = st.genres,
              genres_v2 = st.genres_v2,
              tags = st.tags,
              tags_v2 = st.tags_v2,
              last_updated_at = st.last_updated_at,
              source = st.source,
              content_hash = st.content_hash
            FROM staging_series st 
            WHERE s.id = st.id 
              AND (s.content_hash IS NULL OR s.content_hash != st.content_hash);
          `);
        },
        { op: 'db.update', tags: { step: 'delta_update' } }
      );
      
      logger.info(`Updated ${updateResult.rowCount || 0} rows`);
      if (job) await job.updateProgress(95);

      // 6. INSERT NEW RECORDS
      logger.info('Inserting new records...');
      const insertResult = await withSpan(
        'insert_new_records',
        async () => {
          return await client.query(`
            INSERT INTO series (
              id, state, merged_with, titles, cover, authors, artists, description, year,
              published, popularity, popularity_global_current, popularity_type_current,
              status, is_licensed, has_anime, anime, content_rating, type,
              rating, final_volume, final_chapter, total_chapters, links,
              links_v2, publishers, relationships, relationships_v2,
              genres, genres_v2, tags, tags_v2,
              last_updated_at, source, content_hash
            )
            SELECT 
              st.id, st.state, st.merged_with, st.titles, st.cover, st.authors, st.artists, st.description, st.year,
              st.published, st.popularity, st.popularity_global_current, st.popularity_type_current,
              st.status, st.is_licensed, st.has_anime, st.anime, st.content_rating, st.type,
              st.rating, st.final_volume, st.final_chapter, st.total_chapters, st.links,
              st.links_v2, st.publishers, st.relationships, st.relationships_v2,
              st.genres, st.genres_v2, st.tags, st.tags_v2,
              st.last_updated_at, st.source, st.content_hash
            FROM staging_series st 
            LEFT JOIN series s ON st.id = s.id 
            WHERE s.id IS NULL;
          `);
        },
        { op: 'db.insert', tags: { step: 'insert_new' } }
      );
      
      logger.info(`Inserted ${insertResult.rowCount || 0} rows`);

      // 7. COMMIT
      await withSpan(
        'commit_transaction',
        async () => await client.query('COMMIT'),
        { op: 'db.commit', tags: { step: 'commit' } }
      );
      
      const duration = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
      const stats = {
        inserted: insertResult.rowCount || 0,
        updated: updateResult.rowCount || 0,
        total: totalRecords,
        duration
      };
      
      Sentry.addBreadcrumb({
        message: 'Import completed successfully',
        level: 'info',
        data: stats,
      });

      await discordService.notifyImportCompleted(fileName, stats);
      await invalidateCatalogCaches();

      if (job) await job.updateProgress(100);
      logger.info(`✅ Import complete: ${stats.inserted.toLocaleString()} inserted, ${stats.updated.toLocaleString()} updated in ${duration}`);

    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        logger.error('Failed to rollback transaction:', rollbackErr);
      }

      const errorMsg = (err as Error).message;
      logger.error('Import failed:', err);
      
      captureError(err, {
        tags: {
          process: 'manga_import',
          file: fileName,
        },
        data: {
          file_path: filePath,
          error_message: errorMsg,
          records_processed: processed || 0,
        },
      });

      await discordService.notifyImportFailed(fileName, errorMsg);
      throw err;
    } finally {
      if (sqliteDb) {
        try {
          sqliteDb.close();
        } catch (e) {
          logger.warn('Failed to close SQLite:', e);
        }
      }
      client.release();
    }
  }
}

export const mangaImporterService = new MangaImporterService();
