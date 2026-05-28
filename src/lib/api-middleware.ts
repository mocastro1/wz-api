// ============================================================
// src/lib/api-middleware.ts — Middleware para API routes
// Autenticação, CORS, error handling
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

// Origens permitidas: extensão Chrome + localhost dev + produção
const ALLOWED_ORIGINS = [
  'chrome-extension://',  // qualquer extensão Chrome (prefixo)
  'http://localhost:3000',
  'http://localhost',
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // chamadas server-side sem Origin
  return ALLOWED_ORIGINS.some(o => origin.startsWith(o));
}

// ─── CORS preflight ────────────────────────────────────
export function corsHeaders(req?: NextRequest) {
  const origin = req?.headers.get('origin') || '';
  const allowOrigin = isAllowedOrigin(origin) ? (origin || '*') : 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-SF-Access-Token, X-SF-Instance-Url',
    'Access-Control-Max-Age': '600',
  };
}

export function handleOptions(req?: NextRequest) {
  return NextResponse.json(null, { status: 204, headers: corsHeaders(req) });
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
export function validateApiToken(req: NextRequest): boolean {
  const expected = process.env.API_BEARER_TOKEN;
  if (!expected) return true; // Se não configurado, permite (dev)

  const auth = req.headers.get('authorization');
  if (!auth) return false;

  const [scheme, token] = auth.split(' ');
  return scheme === 'Bearer' && token === expected;
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
