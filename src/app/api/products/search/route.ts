// ============================================================
// GET /api/products/search?q=texto
//
// Autocomplete de modelos de veículo (Product2 ativos). Usado na criação de
// Lead para preencher o lookup Modelo__c. Retorna { value: Id, label: Name }.
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection, sanitizeSoqlString } from '@/lib/salesforce';
import { createRouteLogger } from '@/lib/logger';
import { withTimeout, SF_TIMEOUT, isSfTimeout } from '@/lib/sf-timeout';
import { checkRateLimit } from '@/lib/rate-limit-middleware';
import {
  handleOptions, extractSfCredentials,
  validateApiToken, jsonOk, jsonError,
} from '@/lib/api-middleware';

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(req: NextRequest) {
  const log = createRouteLogger('GET /api/products/search');

  if (!validateApiToken(req)) {
    return jsonError('Token inválido', 401);
  }

  // Typeahead é path quente (1 req por tecla, com debounce) → preset de lookup.
  const rl = checkRateLimit(req, 'lookup', 'products-search');
  if (rl) return rl;

  const creds = extractSfCredentials(req);
  if (!creds) {
    return jsonError('Credenciais Salesforce ausentes', 401);
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();

  // Mínimo de 2 caracteres: evita varredura ampla em Product2 a cada 1ª tecla.
  if (q.length < 2) {
    return jsonOk({ values: [] });
  }

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);

    // sanitizeSoqlString escapa \, ' e os wildcards % _ → texto tratado como literal.
    const safeQ = sanitizeSoqlString(q);
    const soql = `
      SELECT Id, Name
      FROM Product2
      WHERE Name LIKE '%${safeQ}%'
        AND IsActive = true
      ORDER BY Name ASC
      LIMIT 10
    `;

    const result = await withTimeout(
      conn.query<{ Id: string; Name: string }>(soql),
      SF_TIMEOUT.query,
      'products search',
    );

    const values = (result.records || []).map((r) => ({
      value: r.Id,
      label: r.Name,
    }));

    log.done('Busca de modelos', { q, count: values.length });
    return jsonOk({ values });
  } catch (e: unknown) {
    if (isSfTimeout(e)) {
      log.fail('Timeout no Salesforce', { op: e.op, ms: e.ms });
      return jsonError('Salesforce demorou demais para responder. Tente novamente.', 504);
    }
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    log.fail('Erro ao buscar modelos', { error: msg });
    return jsonError(`Erro: ${msg}`, 500);
  }
}
