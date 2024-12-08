// src/utils/Logger.ts
import { createLogger, format, transports } from 'winston';

const env = process.env.NODE_ENV || 'development';

// Define custom log format
const logFormat = format.combine(
  format.timestamp(),
  format.printf(info => `[${info.timestamp}] [${info.level.toUpperCase()}]: ${info.message}`)
);

// Define transports based on environment
const transportList = [
  new transports.Console({
    format: env === 'development' ? format.combine(format.colorize(), logFormat) : logFormat,
  }),
  // Additional transports like File can be added here
];

// Create the logger instance
const logger = createLogger({
  level: env === 'development' ? 'debug' : 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: transportList,
});

// Enable debug messages only in development
if (env !== 'development') {
  logger.remove(transports.Console);
  logger.add(new transports.File({ filename: 'logs/error.log', level: 'error' }));
  logger.add(new transports.File({ filename: 'logs/combined.log' }));
}

export default logger;