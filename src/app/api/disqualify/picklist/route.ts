// ============================================================
// GET /api/disqualify/picklist?object=Lead|Opportunity
// Retorna valores ativos do campo Motivo_de_Perda__c via describe.
// Objeto padrão: Lead. Aceita também Opportunity.
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
  const log = createRouteLogger('GET /api/disqualify/picklist');

  if (!validateApiToken(req)) {
    return jsonError('Token inválido', 401);
  }

  const creds = extractSfCredentials(req);
  if (!creds) {
    return jsonError('Credenciais Salesforce ausentes', 401);
  }

  const { searchParams } = new URL(req.url);
  const objectName = searchParams.get('object') || 'Lead';

  if (!['Lead', 'Opportunity'].includes(objectName)) {
    return jsonError('Parâmetro "object" deve ser "Lead" ou "Opportunity"', 422);
  }

  const fieldName = 'Motivo_de_Perda__c';

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);
    const meta = await conn.describe(objectName);

    const field = meta.fields.find(
      (f) => f.name.toLowerCase() === fieldName.toLowerCase()
    );

    if (!field) {
      log.warn(`Campo ${fieldName} não encontrado em ${objectName}`);
      return jsonError(`Campo "${fieldName}" não encontrado em ${objectName}`, 404);
    }

    if (!field.picklistValues || field.picklistValues.length === 0) {
      log.warn(`${fieldName} não tem valores picklist em ${objectName}`);
      return jsonError(`Campo "${fieldName}" não é picklist ou está vazio`, 400);
    }

    const values = field.picklistValues
      .filter((v) => v.active)
      .map((v) => ({ value: v.value, label: v.label }));

    log.done(`Picklist ${fieldName} (${objectName})`, { count: values.length });
    return jsonOk({ object: objectName, field: fieldName, values });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    log.fail('Erro ao buscar picklist de desqualificação', { error: msg });
    return jsonError(`Erro: ${msg}`, 500);
  }
}
