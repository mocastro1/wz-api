// ============================================================
// src/lib/api-middleware.ts — Middleware para API routes
// Autenticação, CORS, error handling
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// ID FIXO da extensão (estável dev↔publicada via "key" no manifest).
// Sobrescrevível por env caso mude. Travar o ID evita que QUALQUER extensão
// Chrome instalada na máquina do usuário consiga chamar a API.
const EXTENSION_ID = process.env.EXTENSION_ID || 'pkmojofnhnmddfpokdgeihencmjggamj';

// Origens permitidas: a extensão (ID específico) + localhost dev + extras por env.
const ALLOWED_ORIGINS = [
  `chrome-extension://${EXTENSION_ID}`,
  'http://localhost:3000',
  'http://localhost',
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // chamadas sem Origin (server-side) — CORS não se aplica
  return ALLOWED_ORIGINS.includes(origin); // match EXATO (não prefixo)
}

// ─── CORS preflight ────────────────────────────────────
export function corsHeaders(req?: NextRequest) {
  const origin = req?.headers.get('origin') || '';
  // Reflete a origin só se permitida; nunca emite '*'. Sem Origin → usa a 1ª permitida.
  const allowOrigin = isAllowedOrigin(origin) ? (origin || ALLOWED_ORIGINS[0]) : 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-SF-Access-Token, X-SF-Instance-Url',
    'Access-Control-Max-Age': '600',
  };
}

export function handleOptions(req?: NextRequest) {
  // 204 não pode ter corpo — usar NextResponse direto (NextResponse.json(null)
  // anexa body "null" e estoura 500 no preflight, quebrando o CORS do navegador).
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

// ─── Extrai credenciais SF do request ────────────────────────
export interface SfCredentials {
  accessToken: string;
  instanceUrl: string;
}

export function extractSfCredentials(req: NextRequest): SfCredentials | null {
  // Prioridade 1: headers dedicados (mais seguro)
  const headerToken = req.headers.get('x-sf-access-token');
  const headerUrl = req.headers.get('x-sf-instance-url');
  if (headerToken && headerUrl) {
    return { accessToken: headerToken, instanceUrl: headerUrl };
  }
  return null;
}

export async function extractSfCredentialsFromBody(body: Record<string, unknown>): Promise<SfCredentials | null> {
  // Fallback: corpo do request (compatibilidade com extensão atual)
  const token = body.sfAccessToken as string;
  const url = body.sfInstanceUrl as string;
  if (token && url) {
    return { accessToken: token, instanceUrl: url };
  }
  return null;
}

// ─── Valida Bearer token da API ──────────────────────────────
// Compara o Bearer do header com o esperado em tempo constante (anti timing-attack).
function bearerEquals(req: NextRequest, expected: string): boolean {
  const auth = req.headers.get('authorization');
  if (!auth) return false;
  const [scheme, token] = auth.split(' ');
  if (scheme !== 'Bearer' || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function validateApiToken(req: NextRequest): boolean {
  const expected = process.env.API_BEARER_TOKEN;
  if (!expected) {
    // FAIL-CLOSED em produção: sem token configurado, NÃO libera (evita que um
    // deploy sem a env var deixe toda a API aberta). Em dev/test, permite.
    return process.env.NODE_ENV !== 'production';
  }
  return bearerEquals(req, expected);
}

// Gate para endpoints ADMINISTRATIVOS (ex.: /api/logs), com um segredo SEPARADO
// do bearer da extensão. O bearer da extensão é embutido no cliente publicado e,
// portanto, extraível — não serve para proteger logs (que contêm PII).
// LOGS_ADMIN_TOKEN só é conhecido pela operação. Fail-closed em produção.
export function validateAdminToken(req: NextRequest): boolean {
  const expected = process.env.LOGS_ADMIN_TOKEN;
  if (!expected) return process.env.NODE_ENV !== 'production';
  return bearerEquals(req, expected);
}

// ─── Response helpers ────────────────────────────────────────
export function jsonOk(data: unknown, status = 200, req?: NextRequest) {
  return NextResponse.json({ ok: true, ...data as object }, { status, headers: corsHeaders(req) });
}

export function jsonError(
  error: string,
  status = 400,
  reqOrHeaders?: NextRequest | Record<string, string>,
) {
  // 3º arg pode ser NextRequest (para CORS) OU headers extras (ex: Retry-After)
  let headers: Record<string, string>;
  if (reqOrHeaders && typeof (reqOrHeaders as NextRequest).headers?.get === 'function') {
    headers = corsHeaders(reqOrHeaders as NextRequest);
  } else {
    headers = { ...corsHeaders(), ...(reqOrHeaders as Record<string, string> || {}) };
  }
  return NextResponse.json({ ok: false, error }, { status, headers });
}
