'use strict';

// Minimal structured logger for the BlackRoad API.
// Writes JSON lines to stdout unless LOG_LEVEL=silent.

const silent = process.env.LOG_LEVEL === 'silent';

function write(level, data) {
  if (silent) return;
  const line = JSON.stringify({ level, service: 'blackroad-api', ...data, ts: new Date().toISOString() });
  if (level === 'error' || level === 'fatal' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

const logger = {
  debug: (data) => write('debug', typeof data === 'string' ? { msg: data } : data),
  info:  (data) => write('info',  typeof data === 'string' ? { msg: data } : data),
  warn:  (data) => write('warn',  typeof data === 'string' ? { msg: data } : data),
  error: (data) => write('error', typeof data === 'string' ? { msg: data } : data),
  fatal: (data) => write('fatal', typeof data === 'string' ? { msg: data } : data),
};

module.exports = logger;
