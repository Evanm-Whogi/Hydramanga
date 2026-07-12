/*
    Service: LoggerService
    Description: Service to log messages to files and console with timestamps.
    Methods:
        - logger.<TYPE>(message: string): void
*/
import winston from 'winston';
import dotenv from 'dotenv';
dotenv.config();

// Define custom format to include timestamp
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'backend' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
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

// Docker: JSON to stdout so Alloy/Loki can parse structured fields (access logs, etc.).
// Local/dev: colorized human-readable console.
if (process.env.DOCKER === 'true') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
        )
    }));
} else {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp }) => `${timestamp} ${level}: ${message}`)
        )
    }));
}

export default logger;
