const pino = require('pino');
const { buildPinoRedactPaths } = require('./redact');

const DEBUG_MODE =
  String(process.env.DEBUG_MODE || process.env.DEBUG_PROBES || 'false').toLowerCase() ===
  'true';

const level = process.env.LOG_LEVEL || (DEBUG_MODE ? 'debug' : 'info');

const transport =
  process.env.NODE_ENV !== 'production'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      }
    : undefined;

const logger = pino({
  level,
  base: { service: 'blackroad-api' },
  redact: {
    paths: buildPinoRedactPaths(),
    censor: '[REDACTED]',
  },
  transport,
});

module.exports = logger;
