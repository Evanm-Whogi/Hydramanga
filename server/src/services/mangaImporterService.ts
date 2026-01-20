// This is the greated trash you will ever see, provided as a way to import 2.5GB JSON dumps into Postgres efficiently

// src/services/mangaImporterService.ts
import fs from 'fs';
import { Pool } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { pipeline } from 'stream/promises';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { Transform } from 'stream';
import crypto from 'crypto';
import { Job } from 'bullmq';
import logger from '@/services/loggerService';
import { discordService } from '@/services/discordService';
import path from 'path';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

class MangaImporterService {
  // Numeric columns that should NOT be quoted in CSV
  private numericColumns = new Set([
    'id', 'year', 'rating', 'weighted_score', 'is_licensed', 'has_anime'
  ]);

  private formatCSV(val: any, columnName?: string): string {
    if (val === null || val === undefined) return '';
    
    // For numeric columns, don't quote them
    if (columnName && this.numericColumns.has(columnName)) {
      // Convert to string but don't quote
      if (typeof val === 'boolean') {
        return val ? 'true' : 'false';
      }
      return String(val);
    }
    
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    // Escape double quotes by doubling them for CSV format
    return `"${str.replace(/"/g, '""')}"`;
  }

  public async fullSyncManga(filePath: string, job?: Job) {
    const client = await pool.connect();
    const fileName = path.basename(filePath);
    const startTime = Date.now();
    
    try {
      await discordService.notifyImportStarted(fileName);
      console.time('SyncProcess');
      
      // 1. START TRANSACTION
      await client.query('BEGIN');
      
      // Set memory higher for this session to handle the 2.5GB join
      await client.query("SET LOCAL work_mem = '256MB'");

      // 2. CREATE TEMP TABLE 
      // Removed "ON COMMIT DROP" for the duration of this logic to ensure 
      // visibility, we will drop it manually or let the session end.
      await client.query(`
        CREATE TEMP TABLE staging_series (
          id INT, state TEXT, merged_with INT, title TEXT, native_title TEXT, 
          romanized_title TEXT, secondary_titles JSONB, cover JSONB, authors JSONB, 
          artists JSONB, description TEXT, year INT, status TEXT, is_licensed BOOLEAN, 
          has_anime BOOLEAN, anime JSONB, content_rating TEXT, type TEXT, rating REAL, 
          weighted_score REAL, final_volume TEXT, final_chapter TEXT, total_chapters TEXT, links JSONB, 
          publishers JSONB, relationships JSONB, genres JSONB, genres_v2 JSONB, 
          tags JSONB, tags_v2 JSONB, last_updated_at TIMESTAMPTZ, source JSONB, content_hash TEXT
        ) ON COMMIT PRESERVE ROWS;
      `);

      // 3. SETUP COPY STREAM
      const copyStream = client.query(copyFrom(`
        COPY staging_series FROM STDIN WITH (FORMAT csv, DELIMITER '|', QUOTE '"')
      `));

      let processed = 0;
      const columnNames = [
        'id', 'state', 'merged_with', 'title', 'native_title', 'romanized_title',
        'secondary_titles', 'cover', 'authors', 'artists', 'description', 'year',
        'status', 'is_licensed', 'has_anime', 'anime', 'content_rating', 'type',
        'rating', 'weighted_score', 'final_volume', 'final_chapter', 'total_chapters', 'links',
        'publishers', 'relationships', 'genres', 'genres_v2', 'tags', 'tags_v2',
        'last_updated_at', 'source', 'content_hash'
      ];

      const transformStream = new Transform({
        objectMode: true,
        transform: (chunk, enc, cb) => {
          const s = chunk.value;
          const rawData = JSON.stringify(s);
          const hash = crypto.createHash('md5').update(rawData).digest('hex');
          
          const values = [
            s.id, s.state, s.merged_with, s.title, s.native_title, s.romanized_title,
            s.secondary_titles, s.cover, s.authors, s.artists, s.description, s.year,
            s.status, s.is_licensed, s.has_anime, s.anime, s.content_rating, s.type,
            s.rating, s.weighted_score, s.final_volume, s.final_chapter, s.total_chapters, s.links,
            s.publishers, s.relationships, s.genres, s.genres_v2, s.tags, s.tags_v2,
            s.last_updated_at, s.source, hash
          ];
          
          const row = values.map((v, idx) => this.formatCSV(v, columnNames[idx])).join('|') + '\n';

          processed++;
          if (processed % 10000 === 0 && job) {
            job.updateProgress(Math.min(Math.round((processed / 500000) * 100), 99));
          }
          cb(null, row);
        }
      });

      logger.info('Streaming 2.5GB JSON to Postgres...');
      await pipeline(
        fs.createReadStream(filePath), 
        parser(), 
        streamArray(), 
        transformStream, 
        copyStream
      );

      // 4. INDEX THE TEMP TABLE (Crucial for 500k row join speed)
      logger.info('Indexing staging table...');
      await client.query(`CREATE INDEX idx_staging_id ON staging_series(id)`);

      // 5. PERFORM DELTA UPDATE
      logger.info('Performing Delta Update...');
      const updateResult = await client.query(`
        UPDATE series s SET 
          state = st.state, title = st.title, native_title = st.native_title,
          description = st.description, status = st.status, rating = st.rating,
          last_updated_at = st.last_updated_at, content_hash = st.content_hash
        FROM staging_series st 
        WHERE s.id = st.id AND (s.content_hash IS NULL OR s.content_hash != st.content_hash);
      `);

      // 6. PERFORM INSERT
      logger.info('Inserting new records...');
      const insertResult = await client.query(`
        INSERT INTO series (
          id, state, merged_with, title, native_title, romanized_title,
          secondary_titles, cover, authors, artists, description, year,
          status, is_licensed, has_anime, anime, content_rating, type,
          rating, final_volume, final_chapter, total_chapters, links,
          publishers, relationships, genres, genres_v2, tags, tags_v2,
          last_updated_at, source, content_hash
        )
        SELECT 
          st.id, st.state, st.merged_with, st.title, st.native_title, st.romanized_title,
          st.secondary_titles, st.cover, st.authors, st.artists, st.description, st.year,
          st.status, st.is_licensed, st.has_anime, st.anime, st.content_rating, st.type,
          st.rating, st.final_volume, st.final_chapter, st.total_chapters, st.links,
          st.publishers, st.relationships, st.genres, st.genres_v2, st.tags, st.tags_v2,
          st.last_updated_at, st.source, st.content_hash
        FROM staging_series st 
        LEFT JOIN series s ON st.id = s.id 
        WHERE s.id IS NULL;
      `);

      // 7. COMMIT EVERYTHING
      await client.query('COMMIT');
      
      const duration = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
      const stats = {
        inserted: insertResult.rowCount || 0,
        updated: updateResult.rowCount || 0,
        duration
      };
      
      await discordService.notifyImportCompleted(fileName, stats);
      
      if (job) await job.updateProgress(100);
      logger.info(`Sync process completed: ${stats.inserted} inserted, ${stats.updated} updated in ${duration}`);
      console.timeEnd('SyncProcess');

    } catch (err) {
      await client.query('ROLLBACK');
      const errorMsg = (err as Error).message;
      logger.error('Sync Error Details:', err);
      await discordService.notifyImportFailed(fileName, errorMsg);
      throw err; // Throw so BullMQ knows the job failed
    } finally {
      client.release();
    }
  }
}

export const mangaImporterService = new MangaImporterService();