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

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

class MangaImporterService {
  private formatCSV(val: any): string {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    // Escape double quotes by doubling them for CSV format
    return `"${str.replace(/"/g, '""')}"`;
  }

  public async fullSyncManga(filePath: string, job?: Job) {
    const client = await pool.connect();
    try {
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
          final_volume TEXT, final_chapter TEXT, total_chapters TEXT, links JSONB, 
          publishers JSONB, relationships JSONB, genres JSONB, genres_v2 JSONB, 
          tags JSONB, tags_v2 JSONB, last_updated_at TIMESTAMPTZ, source JSONB, content_hash TEXT
        ) ON COMMIT PRESERVE ROWS;
      `);

      // 3. SETUP COPY STREAM
      const copyStream = client.query(copyFrom(`
        COPY staging_series FROM STDIN WITH (FORMAT csv, DELIMITER '|', QUOTE '"')
      `));

      let processed = 0;
      const transformStream = new Transform({
        objectMode: true,
        transform: (chunk, enc, cb) => {
          const s = chunk.value;
          const rawData = JSON.stringify(s);
          const hash = crypto.createHash('md5').update(rawData).digest('hex');
          
          const row = [
            s.id, s.state, s.merged_with, s.title, s.native_title, s.romanized_title,
            s.secondary_titles, s.cover, s.authors, s.artists, s.description, s.year,
            s.status, s.is_licensed, s.has_anime, s.anime, s.content_rating, s.type,
            s.rating, s.final_volume, s.final_chapter, s.total_chapters, s.links,
            s.publishers, s.relationships, s.genres, s.genres_v2, s.tags, s.tags_v2,
            s.last_updated_at, s.source, hash
          ].map(v => this.formatCSV(v)).join('|') + '\n';

          processed++;
          if (processed % 10000 === 0 && job) {
            job.updateProgress(Math.min(Math.round((processed / 500000) * 100), 99));
          }
          cb(null, row);
        }
      });

      console.log('Streaming 2.5GB JSON to Postgres...');
      await pipeline(
        fs.createReadStream(filePath), 
        parser(), 
        streamArray(), 
        transformStream, 
        copyStream
      );

      // 4. INDEX THE TEMP TABLE (Crucial for 500k row join speed)
      console.log('Indexing staging table...');
      await client.query(`CREATE INDEX idx_staging_id ON staging_series(id)`);

      // 5. PERFORM DELTA UPDATE
      console.log('Performing Delta Update...');
      await client.query(`
        UPDATE series s SET 
          state = st.state, title = st.title, native_title = st.native_title,
          description = st.description, status = st.status, rating = st.rating,
          last_updated_at = st.last_updated_at, content_hash = st.content_hash
        FROM staging_series st 
        WHERE s.id = st.id AND (s.content_hash IS NULL OR s.content_hash != st.content_hash);
      `);

      // 6. PERFORM INSERT
      console.log('Inserting new records...');
      await client.query(`
        INSERT INTO series 
        SELECT st.* FROM staging_series st 
        LEFT JOIN series s ON st.id = s.id 
        WHERE s.id IS NULL;
      `);

      // 7. COMMIT EVERYTHING
      await client.query('COMMIT');
      
      if (job) await job.updateProgress(100);
      console.timeEnd('SyncProcess');

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Sync Error Details:', err);
      throw err; // Throw so BullMQ knows the job failed
    } finally {
      client.release();
    }
  }
}

export const mangaImporterService = new MangaImporterService();