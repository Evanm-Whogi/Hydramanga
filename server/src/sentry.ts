import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { expressIntegration } from "@sentry/node";
import logger from '@/services/loggerService';

export function initSentry() {
  logger.info('Initializing Sentry for error tracking and performance monitoring');
  
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.1,
    debug: false,
    integrations: [
      nodeProfilingIntegration(),
      expressIntegration(),
    ],
  });
}
