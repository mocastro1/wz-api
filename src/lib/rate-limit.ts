// ============================================================
// src/lib/rate-limit.ts
// Rate limiter em memória (token-bucket por janela fixa).
// Para uso interno (1 instância). Se escalar para múltiplas instâncias,
// trocar por Redis/Upstash mantendo a mesma assinatura de `rateLimit()`.
//
// Estratégia:
//   - `key` deve combinar rota + identidade (ex: "lookup:userId" ou IP)
//   - retorna { ok, retryAfterMs } — rota responde 429 quando ok=false
// ============================================================

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Cleanup periódico para evitar leak de memória em chaves antigas.
// Roda no máximo 1x/min, só na primeira chamada de cada janela.
let lastCleanup = 0;
function maybeCleanup(now: number) {
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, b] of buckets) {
    if (b.resetAt < now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterMs?: number;
  remaining?: number;
}

/**
 * Aplica rate limit. Janela fixa que reseta após `windowMs`.
 * @param key  ex: `lookup:${userId}` — combine rota + identidade
 * @param max  número máximo de requisições na janela
 * @param windowMs  duração da janela em ms
 */
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  maybeCleanup(now);

  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1 };
  }

  if (b.count >= max) {
    return { ok: false, retryAfterMs: b.resetAt - now };
  }

  b.count++;
  return { ok: true, remaining: max - b.count };
}

/** Presets por categoria de rota. Ajuste se a operação for mais rara/comum. */
export const RL = {
  // Lookup é o caminho mais quente — extensão chama a cada mudança de conversa.
  // 60/min = 1 por segundo em pico, suficiente pra navegação fluida.
  lookup:       { max: 60, windowMs: 60_000 },

  // Escrita: leads, conversas, lembretes, desqualificação.
  // 20/min é mais que o suficiente — protege contra loop bug.
  write:        { max: 20, windowMs: 60_000 },

  // Metadata: picklist, auth check. Cacheável no client, então pouco frequente.
  metadata:     { max: 30, windowMs: 60_000 },

  // Telemetria: batch da extensão (1 envio a cada 30s normalmente).
  telemetry:    { max: 30, windowMs: 60_000 },
} as const;
