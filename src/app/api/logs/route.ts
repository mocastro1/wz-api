// ============================================================
// GET /api/logs — Retorna os últimos logs do servidor
// Protegido pelo mesmo Bearer token da API
// ============================================================

import { NextRequest } from 'next/server';
import { getLogs, clearLogs, LogLevel } from '@/lib/logger';
import { handleOptions, validateAdminToken, jsonOk, jsonError } from '@/lib/api-middleware';

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(req: NextRequest) {
  // Admin-only: logs contêm PII. Protegido por LOGS_ADMIN_TOKEN (não o bearer
  // da extensão, que é público depois de publicada).
  if (!validateAdminToken(req)) return jsonError('Token inválido', 401);

  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level') as LogLevel | null;
  const last  = parseInt(searchParams.get('last') || '100', 10);

  const logs = getLogs(level ?? undefined, last);
  return jsonOk({ count: logs.length, logs });
}

export async function DELETE(req: NextRequest) {
  if (!validateAdminToken(req)) return jsonError('Token inválido', 401);
  clearLogs();
  return jsonOk({ cleared: true });
}
