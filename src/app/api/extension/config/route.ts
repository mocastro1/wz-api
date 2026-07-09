// ============================================================
// GET /api/extension/config — Config remota da extensão
// Serve os seletores DOM do WhatsApp Web e flags de comportamento
// a partir de config/extension-config.json (volume no Docker).
// Editar o JSON no servidor corrige a extensão SEM nova release
// na Chrome Web Store. A extensão tem fallback embutido: se esta
// rota falhar ou o JSON for inválido, nada quebra no cliente.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { corsHeaders, handleOptions, jsonError } from '@/lib/api-middleware';
import { createRouteLogger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit-middleware';

const ROUTE = 'GET /api/extension/config';

const CONFIG_PATH = path.join(process.cwd(), 'config', 'extension-config.json');

// Valida o formato ANTES de servir: config malformada nunca chega à extensão
// (que também valida do lado dela — cinto e suspensório).
const ConfigSchema = z.object({
  version: z.number().int().positive(),
  updatedAt: z.string().optional(),
  comment: z.string().optional(),
  selectorGroups: z.record(z.array(z.string().min(1).max(300)).min(1).max(20)),
  flags: z.record(z.boolean()),
});

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

// Sem autenticação: o conteúdo são seletores de HTML públicos, nada sensível.
// Protegido por rate limit + CORS travado no ID da extensão (como as demais rotas).
export async function GET(req: NextRequest) {
  const log = createRouteLogger(ROUTE);

  const rl = checkRateLimit(req, 'metadata', 'extension-config');
  if (rl) return rl;

  let raw: string;
  try {
    raw = await fs.readFile(CONFIG_PATH, 'utf-8');
  } catch (e) {
    log.warn('Arquivo de config não encontrado', { path: CONFIG_PATH });
    return jsonError('Config indisponível', 503, req);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.warn('JSON inválido em extension-config.json — extensão seguirá no fallback');
    return jsonError('Config malformada', 500, req);
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    log.warn('Config reprovada na validação', { issues: result.error.issues.slice(0, 3) });
    return jsonError('Config inválida: ' + result.error.message, 500, req);
  }

  const { comment: _omit, ...config } = result.data;
  log.done(`Config v${config.version} servida`);

  return NextResponse.json(
    { ok: true, config },
    {
      headers: {
        ...corsHeaders(req),
        // 5 min de cache HTTP: reduz carga sem atrasar correção de emergência
        // (o cache "longo" de 6h fica do lado da extensão, em chrome.storage).
        'Cache-Control': 'public, max-age=300',
      },
    },
  );
}
