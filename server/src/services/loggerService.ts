/*
    Service: LoggerService
    Description: Service to log messages to files and console with timestamps.
    Methods:
        - logger.<TYPE>(message: string): void
*/
import winston from 'winston';
import dotenv from 'dotenv';
import {LokiAccessTransport} from '@/services/lokiAccessTransport';
dotenv.config();

// Define custom format to include timestamp
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

/** Drop high-volume access logs from a transport (console); they still go to files + Loki. */
const skipAccess = winston.format((info) => (info.type === 'access' ? false : info));

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'backend' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.File({
            filename: 'logs/access.log',
            format: winston.format.combine(
                winston.format((info) => (info.type === 'access' ? info : false))(),
                logFormat
            ),
        }),
        // Dedicated queue log file for queueService-only messages
        new winston.transports.File({
            filename: 'logs/queue.log',
            level: 'info',
            format: winston.format.combine(
                winston.format((info) => info.service === 'queueService' ? info : false)(),
                logFormat
            )
        }),
    ]
});

// Docker: JSON to stdout for Alloy/Loki (non-access). Access logs push directly to Loki.
// Local/dev: colorized human-readable console.
if (process.env.DOCKER === 'true') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            skipAccess(),
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
        )
    }));

    const lokiUrl = (process.env.LOKI_URL || 'http://loki:3100').trim();
    if (lokiUrl && process.env.LOKI_ACCESS_LOGS !== 'false') {
        logger.add(new LokiAccessTransport({
            host: lokiUrl,
            labels: {
                job: 'access',
                service: 'backend',
                compose_project: process.env.COMPOSE_PROJECT_NAME || 'mangascrolls',
                compose_service: process.env.RUN_WORKERS === 'true' ? 'worker' : 'server',
            },
        }));
    }
} else {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            skipAccess(),
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp }) => `${timestamp} ${level}: ${message}`)
        )
    }));
}

export default logger;
