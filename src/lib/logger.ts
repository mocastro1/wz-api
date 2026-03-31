// ============================================================
// src/lib/logger.ts — Logger estruturado para wz-api
// Grava no console (colorido) + buffer em memória (GET /api/logs)
// ============================================================

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id:        number;
  ts:        string;   // ISO timestamp
  level:     LogLevel;
  route:     string;   // Ex: "POST /api/leads/lookup"
  msg:       string;
  data?:     unknown;
  durationMs?: number;
}

// Buffer circular — mantém os últimos 200 logs em memória
const MAX_ENTRIES = 200;
const buffer: LogEntry[] = [];
let seq = 0;

function push(level: LogLevel, route: string, msg: string, data?: unknown, durationMs?: number) {
  const entry: LogEntry = {
    id:    ++seq,
    ts:    new Date().toISOString(),
    level,
    route,
    msg,
    data:  data !== undefined ? sanitize(data) : undefined,
    durationMs,
  };

  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();

  // Console colorido
  const colors: Record<LogLevel, string> = {
    info:  '\x1b[36m',   // cyan
    warn:  '\x1b[33m',   // yellow
    error: '\x1b[31m',   // red
    debug: '\x1b[90m',   // gray
  };
  const reset = '\x1b[0m';
  const dur = durationMs !== undefined ? ` (${durationMs}ms)` : '';
  const c = colors[level];

  const dataStr = data !== undefined
    ? '\n    ' + JSON.stringify(sanitize(data), null, 2).replace(/\n/g, '\n    ')
    : '';

  console.log(`${c}[wz-api][${level.toUpperCase()}]${reset} ${route} — ${msg}${dur}${dataStr}`);
}

// Remove campos sensíveis antes de logar
function sanitize(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = { ...(obj as Record<string, unknown>) };
  for (const key of ['access_token', 'sfAccessToken', 'X-SF-Access-Token', 'Authorization', 'password', 'secret']) {
    if (key in clone) clone[key] = '[REDACTED]';
  }
  return clone;
}

export function getLogs(level?: LogLevel, last = 100): LogEntry[] {
  const entries = level ? buffer.filter(e => e.level === level) : [...buffer];
  return entries.slice(-last).reverse(); // Mais recentes primeiro
}

export function clearLogs() {
  buffer.length = 0;
}

// ─── Logger por rota ─────────────────────────────────────────
export function createRouteLogger(route: string) {
  const start = Date.now();
  return {
    info:  (msg: string, data?: unknown) => push('info',  route, msg, data),
    warn:  (msg: string, data?: unknown) => push('warn',  route, msg, data),
    error: (msg: string, data?: unknown) => push('error', route, msg, data),
    debug: (msg: string, data?: unknown) => push('debug', route, msg, data),
    done:  (msg: string, data?: unknown) => push('info',  route, msg, data, Date.now() - start),
    fail:  (msg: string, data?: unknown) => push('error', route, msg, data, Date.now() - start),
  };
}
