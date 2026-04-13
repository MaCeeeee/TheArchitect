import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? { target: 'pino/file', options: { destination: 1 } } // stdout in dev (readable)
    : undefined, // structured JSON in production (machine-parseable)
  base: { service: 'thearchitect' },
});

// Drop-in replacements for console.log/error/warn used across the codebase.
// Import { log } from './config/logger' and use log.info/error/warn.
export const log = logger;
