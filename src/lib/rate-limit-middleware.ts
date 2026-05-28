// ============================================================
// src/lib/rate-limit-middleware.ts
// Helper para aplicar rate limit em rotas Next.js.
// Identifica o cliente por uma "fingerprint" do token SF (não loga o token).
// ============================================================

import { NextRequest } from 'next/server';
import { rateLimit, RL, type RateLimitResult } from './rate-limit';
import { jsonError } from './api-middleware';

/** Gera uma fingerprint curta (não-reversível) do access token para usar como chave.
 *  Usa só os últimos 12 chars do token — o token é opaco, então isso é único o
 *  suficiente por sessão sem expor o valor. */
function clientKey(req: NextRequest): string {
  const token = req.headers.get('x-sf-access-token') || '';
  if (token) return `sf:${token.slice(-12)}`;
  // Fallback: IP (atrás de proxy, ler X-Forwarded-For)
  const xfwd = req.headers.get('x-forwarded-for') || '';
  const ip = xfwd.split(',')[0]?.trim() || 'unknown';
  return `ip:${ip}`;
}

/** Aplica rate limit e retorna Response 429 se exceder, ou null se OK. */
export function checkRateLimit(
  req: NextRequest,
  bucket: keyof typeof RL,
  routeName: string,
): Response | null {
  const { max, windowMs } = RL[bucket];
  const key = `${routeName}:${clientKey(req)}`;
  const result: RateLimitResult = rateLimit(key, max, windowMs);
  if (result.ok) return null;

  const retryAfterSec = Math.ceil((result.retryAfterMs || windowMs) / 1000);
  return jsonError(
    `Muitas requisições. Tente novamente em ${retryAfterSec}s.`,
    429,
    { 'Retry-After': String(retryAfterSec) },
  );
}
