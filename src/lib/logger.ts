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

// Chaves cujo valor é segredo → redige por completo.
const SECRET_KEYS = [
  'access_token', 'sfaccesstoken', 'x-sf-access-token', 'authorization',
  'password', 'secret', 'refresh_token',
];
// Chaves de telefone (PII) → mascara, mantendo só os últimos 4 dígitos.
const PHONE_KEY_HINTS = ['phone', 'mobilephone', 'sellerphone'];

function maskPhone(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const digits = v.replace(/\D/g, '');
  if (digits.length < 4) return '••••';
  return '••••' + digits.slice(-4);
}

// Remove segredos e mascara PII (telefones) antes de logar — recursivo, pois
// os dados aparecem aninhados (telemetry.detail, mensagens de conversa, etc.).
function sanitize(obj: unknown, depth = 0): unknown {
  if (depth > 6) return '[…]';
  if (Array.isArray(obj)) return obj.map((v) => sanitize(v, depth + 1));
  if (!obj || typeof obj !== 'object') return obj;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj as Record<string, unknown>)) {
    const lk = k.toLowerCase();
    if (SECRET_KEYS.includes(lk)) out[k] = '[REDACTED]';
    else if (PHONE_KEY_HINTS.some((h) => lk.includes(h))) out[k] = maskPhone(val);
    else out[k] = sanitize(val, depth + 1);
  }
  return out;
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
