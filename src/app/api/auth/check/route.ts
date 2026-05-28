// ============================================================
// GET /api/auth/check — Verifica autenticação SF e retorna dados do User
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection, validateConnection, sanitizeSfId } from '@/lib/salesforce';
import { createRouteLogger } from '@/lib/logger';
import {
  handleOptions, extractSfCredentials, validateApiToken, jsonOk, jsonError,
} from '@/lib/api-middleware';
import { checkRateLimit } from '@/lib/rate-limit-middleware';
import { withTimeout, SF_TIMEOUT, isSfTimeout } from '@/lib/sf-timeout';

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(req: NextRequest) {
  const log = createRouteLogger('GET /api/auth/check');

  if (!validateApiToken(req)) {
    return jsonError('Token inválido', 401);
  }

  const rl = checkRateLimit(req, 'metadata', 'auth-check');
  if (rl) return rl;

  const creds = extractSfCredentials(req);
  if (!creds) {
    return jsonOk({ authenticated: false });
  }

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);
    const identity = await withTimeout(validateConnection(conn), SF_TIMEOUT.query, 'auth identity');

    // Busca dados extras do User (Apelido_Concessionaria__c para lead creation)
    let userData = {};
    try {
      const safeUserId = sanitizeSfId(identity.userId);
      if (!safeUserId) throw new Error('userId inválido');
      const userResult = await withTimeout(conn.query(`
        SELECT Id, Name, Username, Apelido_Concessionaria__c
        FROM User
        WHERE Id = '${safeUserId}'
        LIMIT 1
      `), SF_TIMEOUT.query, 'query User');
      if (userResult.records?.length > 0) {
        const u = userResult.records[0] as Record<string, unknown>;
        userData = {
          concessionariaRef: u.Apelido_Concessionaria__c || '',
        };
        log.info('Dados do User SF carregados', { userId: identity.userId, concessionariaRef: u.Apelido_Concessionaria__c });
      }
    } catch (e) {
      log.warn('Erro ao buscar dados extras do User (não crítico)', { error: (e as Error).message });
    }

    log.done('Auth check OK', { userId: identity.userId, userName: identity.userName });
    return jsonOk({
      authenticated: true,
      ...identity,
      ...userData,
    });
  } catch (e: unknown) {
    if (isSfTimeout(e)) {
      log.fail('Timeout na validação de auth', { op: e.op, ms: e.ms });
      return jsonError('Salesforce demorou demais para responder.', 504);
    }
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    log.fail('Auth check falhou', { error: msg });
    return jsonOk({ authenticated: false, error: msg });
  }
}
