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

    // 1ª tentativa: UI API — respeita Record Type do usuário e tipo do objeto.
    // Endpoint: /ui-api/object-info/{object}/picklist-values/{recordTypeId}/{field}
    // Como não sabemos o RecordTypeId, usamos o "default" (master) que respeita
    // o defaultRecordTypeId do objeto para o usuário logado.
    try {
      const objectInfo = await conn.request<{
        defaultRecordTypeId?: string;
        recordTypeInfos?: Record<string, { recordTypeId: string; defaultRecordTypeMapping: boolean; available: boolean }>;
      }>(`/ui-api/object-info/${objectName}`);

      // Pega o default record type (ou o master se não tiver default)
      let recordTypeId = objectInfo.defaultRecordTypeId;
      if (!recordTypeId && objectInfo.recordTypeInfos) {
        const def = Object.values(objectInfo.recordTypeInfos).find(
          (rt) => rt.defaultRecordTypeMapping && rt.available
        );
        recordTypeId = def?.recordTypeId;
      }
      if (!recordTypeId) recordTypeId = '012000000000000AAA'; // Master Record Type

      const uiResp = await conn.request<{
        picklistFieldValues?: Record<string, {
          values: Array<{ value: string; label: string; validFor?: number[] }>;
        }>;
      }>(`/ui-api/object-info/${objectName}/picklist-values/${recordTypeId}`);

      const fieldValues = uiResp.picklistFieldValues?.[fieldName];
      if (fieldValues?.values && fieldValues.values.length > 0) {
        const values = fieldValues.values.map((v) => ({ value: v.value, label: v.label }));
        log.done(`Picklist ${fieldName} (${objectName}) via UI API`, { count: values.length, recordTypeId });
        return jsonOk({ object: objectName, field: fieldName, values, source: 'ui-api' });
      }
    } catch (uiErr) {
      log.warn('UI API falhou, caindo para describe()', {
        error: uiErr instanceof Error ? uiErr.message : String(uiErr),
      });
    }

    // 2ª tentativa (fallback): describe clássico do sobject
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

    log.done(`Picklist ${fieldName} (${objectName}) via describe`, { count: values.length });
    return jsonOk({ object: objectName, field: fieldName, values, source: 'describe' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    log.fail('Erro ao buscar picklist de desqualificação', { error: msg });
    return jsonError(`Erro: ${msg}`, 500);
  }
}
