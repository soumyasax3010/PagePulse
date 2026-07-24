import { fileURLToPath } from 'node:url';

import express, { type Express } from 'express';

import { env } from './config/env.js';
import { requestLoggingMiddleware } from './middleware/request-logging.middleware.js';
import { auditRouter } from './routes/audit.route.js';
import { healthRouter } from './routes/health.route.js';

const publicDirectory = fileURLToPath(new URL('../public', import.meta.url));

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  if (env.nodeEnv === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(requestLoggingMiddleware);
  app.use(express.json());
  app.use('/health', healthRouter);
  app.use('/audit', auditRouter);
  app.use(express.static(publicDirectory));

  return app;
}

export const app = createApp();
