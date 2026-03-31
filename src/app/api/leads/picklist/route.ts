// ============================================================
// GET /api/leads/picklist?field=Interesse_em__c
// Retorna os valores ativos de um campo picklist do objeto Lead.
// Os valores vêm diretamente do Salesforce (describe), sem hardcode.
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection } from '@/lib/salesforce';
import { createRouteLogger } from '@/lib/logger';
import {
  handleOptions, extractSfCredentials,
  validateApiToken, jsonOk, jsonError,
} from '@/lib/api-middleware';

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(req: NextRequest) {
  const log = createRouteLogger('GET /api/leads/picklist');

  if (!validateApiToken(req)) {
    return jsonError('Token inválido', 401);
  }

  const creds = extractSfCredentials(req);
  if (!creds) {
    return jsonError('Credenciais Salesforce ausentes', 401);
  }

  const { searchParams } = new URL(req.url);
  const fieldName = searchParams.get('field');

  if (!fieldName) {
    return jsonError('Parâmetro "field" é obrigatório', 422);
  }

  // Valida nome do campo: apenas letras, números e _ (previne injeção de API path)
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(fieldName)) {
    return jsonError('Nome de campo inválido', 422);
  }

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);
    const meta = await conn.describe('Lead');

    const field = meta.fields.find(
      (f) => f.name.toLowerCase() === fieldName.toLowerCase()
    );

    if (!field) {
      log.warn('Campo não encontrado no Lead', { fieldName });
      return jsonError(`Campo "${fieldName}" não encontrado no objeto Lead`, 404);
    }

    if (!field.picklistValues || field.picklistValues.length === 0) {
      log.warn('Campo não é picklist ou não tem valores', { fieldName });
      return jsonError(`Campo "${fieldName}" não é um picklist ou está vazio`, 400);
    }

    const values = field.picklistValues
      .filter((v) => v.active)
      .map((v) => ({ value: v.value, label: v.label }));

    log.done(`Picklist "${fieldName}" carregada`, { count: values.length });
    return jsonOk({ field: fieldName, values });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    log.fail('Erro ao buscar picklist', { error: msg });
    return jsonError(`Erro ao buscar picklist: ${msg}`, 500);
  }
}
