import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from 'pg';
import dotenv from 'dotenv';
import logger from '@/services/loggerService';
import * as schema from '@/db/schema';
dotenv.config();

if(!process.env.DATABASE_URL) throw new Error('DB_URL is required');

// Initialize PG Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Initialize Drizzle with PG
const db = drizzle(pool, { schema });

// Export pool for graceful shutdown
export { pool };

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled Rejection:', error);
});

// Test Connection
pool.connect((err, client, release) => {
    if (err) {
        logger.error('Database connection failed:', err);
        return;
    }
    console.log('Database connected successfully');
    release(); // Important to release the client back to the pool
});

export { db, schema };