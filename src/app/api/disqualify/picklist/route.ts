// ============================================================
// GET /api/disqualify/picklist?object=Lead|Opportunity&recordId=...
//
// Motivo_de_Perda__c é picklist DEPENDENTE de LeadSource (Lead e Opp).
// A dependência está no bitmask `ValidFor` (Base64) de cada valor.
//
// IMPORTANTE: o índice do bit corresponde à ORDEM do PicklistValueInfo
// (campo controlador), que NÃO é a mesma ordem do describe(). Por isso
// usamos PicklistValueInfo (SOQL) como fonte tanto da ordem das origens
// quanto dos motivos + ValidFor.
//
// REGRA: apenas IsActive == true (valores inativos causam erro 500 no SF)
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection, sanitizeSfId } from '@/lib/salesforce';
import { createRouteLogger } from '@/lib/logger';
import { getValidMotivosForOrigin } from '@/lib/motivo-perda';
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
  const recordId   = searchParams.get('recordId') || '';

  if (!['Lead', 'Opportunity'].includes(objectName)) {
    return jsonError('Parâmetro "object" deve ser "Lead" ou "Opportunity"', 422);
  }

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);

    // Busca o LeadSource do registro
    let leadSource: string | null = null;
    if (recordId) {
      const safeId = sanitizeSfId(recordId);
      if (safeId) {
        const r = await conn.query<{ LeadSource: string | null }>(
          `SELECT LeadSource FROM ${objectName} WHERE Id = '${safeId}' LIMIT 1`
        );
        leadSource = r.records?.[0]?.LeadSource ?? null;
      }
    }

    if (!leadSource) {
      return jsonError('Registro sem LeadSource (origem) — não é possível determinar os motivos válidos', 422);
    }

    const valid = await getValidMotivosForOrigin(conn, objectName, leadSource);

    log.done(`Picklist dependente "${leadSource}" (${objectName})`, {
      count: valid.length,
    });

    if (valid.length === 0) {
      return jsonError(
        `Nenhum motivo de perda configurado para a origem "${leadSource}" em ${objectName}.`,
        404
      );
    }

    return jsonOk({
      object:     objectName,
      field:      'Motivo_de_Perda__c',
      leadSource,
      values:     valid.map((v) => ({ value: v, label: v })),
      source:     'ui-api-controllerValues',
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    log.fail('Erro ao buscar picklist de desqualificação', { error: msg });
    return jsonError(`Erro: ${msg}`, 500);
  }
}
