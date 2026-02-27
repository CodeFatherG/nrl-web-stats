/**
 * Logger utility with structured JSON output
 * Adapted for Cloudflare Workers (no process.env)
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

function formatLog(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
}

// Environment detection for Workers
let isDebugEnabled = false;

/**
 * Set debug mode (call with env.ENVIRONMENT !== 'production' in worker)
 */
export function setDebugMode(enabled: boolean): void {
  isDebugEnabled = enabled;
}

export const logger = {
  info(message: string, context?: Record<string, unknown>): void {
    console.log(JSON.stringify(formatLog('info', message, context)));
  },

  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(JSON.stringify(formatLog('warn', message, context)));
  },

  error(message: string, context?: Record<string, unknown>): void {
    console.error(JSON.stringify(formatLog('error', message, context)));
  },

  debug(message: string, context?: Record<string, unknown>): void {
    if (isDebugEnabled) {
      console.log(JSON.stringify(formatLog('debug', message, context)));
    }
  },
};
