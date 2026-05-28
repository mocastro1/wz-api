// ============================================================
// POST /api/telemetry — Recebe eventos de telemetry da extensão
// Usado para detectar mudanças no HTML do WhatsApp Web
// (qual seletor/estratégia falhou ou foi usada como fallback)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  corsHeaders,
  handleOptions,
  jsonError,
  jsonOk,
  validateApiToken,
} from '@/lib/api-middleware';
import { createRouteLogger, getLogs } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit-middleware';

const ROUTE = 'POST /api/telemetry';

const TelemetryEventSchema = z.object({
  type: z.enum([
    'store_unavailable',
    'store_found',
    'selector_fallback',
    'extraction_failed',
    'strategy_used',
    'group_detection',
  ]),
  context: z.string().max(200),
  detail: z.record(z.unknown()).optional(),
  extensionVersion: z.string().max(20).optional(),
  userAgent: z.string().max(300).optional(),
  url: z.string().max(300).optional(),
});

const PayloadSchema = z.object({
  events: z.array(TelemetryEventSchema).min(1).max(50),
});

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function POST(req: NextRequest) {
  const log = createRouteLogger(ROUTE);

  if (!validateApiToken(req)) {
    log.warn('Token inválido');
    return jsonError('Não autorizado', 401, req);
  }

  const rl = checkRateLimit(req, 'telemetry', 'telemetry');
  if (rl) return rl;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('JSON inválido', 400, req);
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('Payload inválido: ' + parsed.error.message, 400, req);
  }

  const { events } = parsed.data;

  for (const ev of events) {
    const level = ev.type === 'store_found' ? 'info' : 'warn';
    log[level](`telemetry:${ev.type}`, {
      context: ev.context,
      detail: ev.detail,
      v: ev.extensionVersion,
      url: ev.url,
    });
  }

  log.done(`Recebidos ${events.length} eventos`);
  return jsonOk({ received: events.length }, 200, req);
}

// GET — lista eventos recentes (para dashboards futuros)
export async function GET(req: NextRequest) {
  if (!validateApiToken(req)) {
    return jsonError('Não autorizado', 401, req);
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 200);

  const entries = getLogs('warn', limit)
    .concat(getLogs('info', limit))
    .filter(e => e.route === ROUTE)
    .sort((a, b) => b.id - a.id)
    .slice(0, limit);

  return NextResponse.json(
    { ok: true, count: entries.length, events: entries },
    { headers: corsHeaders(req) }
  );
}
