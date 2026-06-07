import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as Sentry from "@sentry/node";
import dotenv from "dotenv";
import logger from "@/services/loggerService";
import * as schema from "@/db/schema";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

// Capture original query
const originalQuery = Pool.prototype.query;

// Patch Pool.prototype.query to add Sentry tracing
(Pool.prototype as any).query = function (this: Pool, ...args: any[]) {
  const query = args[0];
  // Only include query statement if it's reasonable length (avoid huge queries)
  const queryStatement = typeof query === 'string' && query.length < 500 ? query.substring(0, 100) : '[query]';
  
  return Sentry.startSpan(
    {
      name: "db.query",
      op: "db",
      attributes: {
        "db.system": "postgresql",
        ...(typeof query === 'string' && { "db.statement": queryStatement }),
      },
    },
    () => originalQuery.apply(this, args as any)
  );
};

// Initialize PG Pool
const poolMax = parseInt(process.env.DB_POOL_MAX || '60', 10);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: poolMax,
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || '60000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MS || '30000', 10),
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

logger.info(`Database pool initialized (max=${poolMax})`, { service: 'database' });

// Initialize Drizzle with PG
const db = drizzle(pool, { schema });

// Export pool for graceful shutdown
export { pool };

process.on("unhandledRejection", (error) => {
  logger.error("Unhandled Rejection:", error);
  Sentry.captureException(error);
});

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    logger.error("Database connection failed:", err);
    Sentry.captureException(err);
    return;
  }

  logger.info("Database connected successfully", { service: "database" });
  release();
});

export { db, schema };
