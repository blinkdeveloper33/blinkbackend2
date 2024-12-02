// src/services/logger.ts ⭐️⭐️⭐️

import { createLogger, format, transports } from 'winston';
import config from '../config';

/**
 * Initialize the logger using Winston.
 * Logs are written to files and, in non-production environments, to the console.
 */
const logger = createLogger({
  level: config.LOG_LEVEL || 'info', // Dynamic log level based on environment
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'blinkbackend2' },
  transports: [
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
  ],
});

// If we're not in production, log to the console as well
if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple()
    )
  }));
}

export default logger;
