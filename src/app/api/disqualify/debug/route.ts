// ============================================================
// GET /api/disqualify/debug — Diagnostico das regras
// ?recordId=... → mostra estado atual do Lead/Opp
// ?object=Lead|Opportunity → lista picklist via UI API e describe
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection, sanitizeSfId } from '@/lib/salesforce';
import { createRouteLogger } from '@/lib/logger';
import {
  handleOptions, extractSfCredentials,
  validateApiToken, jsonOk, jsonError,
} from '@/lib/api-middleware';

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(req: NextRequest) {
  const log = createRouteLogger('GET /api/disqualify/debug');

  if (!validateApiToken(req)) {
    return jsonError('Token inválido', 401);
  }

  const creds = extractSfCredentials(req);
  if (!creds) {
    return jsonError('Credenciais Salesforce ausentes', 401);
  }

  const { searchParams } = new URL(req.url);
  const recordId  = searchParams.get('recordId');
  const objectName = (searchParams.get('object') || 'Lead');

  const conn = createConnection(creds.accessToken, creds.instanceUrl);
  const out: Record<string, unknown> = { object: objectName };

  // 1) Estado do registro
  if (recordId) {
    const safeId = sanitizeSfId(recordId);
    if (!safeId) return jsonError('recordId inválido', 422);

    try {
      if (objectName === 'Lead') {
        const r = await conn.query(`
          SELECT Id, Name, Status, Motivo_de_Perda__c, IsConverted,
                 Desqualificado_Automacao__c
          FROM Lead WHERE Id = '${safeId}' LIMIT 1
        `);
        out.record = r.records?.[0] || null;
      } else {
        const r = await conn.query(`
          SELECT Id, Name, StageName, MOTIVO_DE_PERDA__C, IsClosed
          FROM Opportunity WHERE Id = '${safeId}' LIMIT 1
        `);
        out.record = r.records?.[0] || null;
      }
    } catch (e) {
      out.record_error = e instanceof Error ? e.message : String(e);
    }
  }

  // 2) Status validos (Lead) ou StageName validos (Opp)
  try {
    if (objectName === 'Lead') {
      const r = await conn.query(`
        SELECT MasterLabel, IsActive, IsConverted, IsDefault
        FROM LeadStatus
        ORDER BY SortOrder
      `);
      out.leadStatusList = r.records;
    } else {
      const meta = await conn.describe('Opportunity');
      const stageField = meta.fields.find((f) => f.name === 'StageName');
      out.opportunityStages = stageField?.picklistValues
        ?.filter((p) => p.active)
        ?.map((p) => ({ value: p.value, label: p.label, defaultValue: p.defaultValue }));
    }
  } catch (e) {
    out.status_error = e instanceof Error ? e.message : String(e);
  }

  // 3) Picklist Motivo_de_Perda__c — describe()
  try {
    const meta = await conn.describe(objectName);
    const field = meta.fields.find((f) => f.name === 'Motivo_de_Perda__c');
    const motivoList = field?.picklistValues
      ?.filter((p) => p.active)
      ?.map((p) => ({ value: p.value, label: p.label })) || [];
    out.motivoPerdaViaDescribe = motivoList;
    out.motivoPerdaCount = motivoList.length;
  } catch (e) {
    out.describe_error = e instanceof Error ? e.message : String(e);
  }

  // 4) Picklist Motivo_de_Perda__c — UI API (respeita Record Type)
  try {
    const objectInfo = await conn.request<{
      defaultRecordTypeId?: string;
      recordTypeInfos?: Record<string, { recordTypeId: string; defaultRecordTypeMapping: boolean; available: boolean; name?: string }>;
    }>(`/ui-api/object-info/${objectName}`);

    out.defaultRecordTypeId = objectInfo.defaultRecordTypeId;
    out.recordTypes = objectInfo.recordTypeInfos
      ? Object.entries(objectInfo.recordTypeInfos).map(([k, v]) => ({
          name: k,
          recordTypeId: v.recordTypeId,
          available: v.available,
          isDefault: v.defaultRecordTypeMapping,
        }))
      : [];

    let recordTypeId = objectInfo.defaultRecordTypeId;
    if (!recordTypeId && objectInfo.recordTypeInfos) {
      const def = Object.values(objectInfo.recordTypeInfos).find(
        (rt) => rt.defaultRecordTypeMapping && rt.available
      );
      recordTypeId = def?.recordTypeId;
    }
    if (!recordTypeId) recordTypeId = '012000000000000AAA';

    out.usedRecordTypeId = recordTypeId;

    const uiResp = await conn.request<{
      picklistFieldValues?: Record<string, { values: Array<{ value: string; label: string }> }>;
    }>(`/ui-api/object-info/${objectName}/picklist-values/${recordTypeId}`);

    out.motivoPerdaViaUiApi = uiResp.picklistFieldValues?.['Motivo_de_Perda__c']?.values || null;
    out.allPicklistsInUiApi = Object.keys(uiResp.picklistFieldValues || {});
  } catch (e) {
    out.uiApi_error = e instanceof Error ? e.message : String(e);
  }

  log.done('debug', { object: objectName, recordId, hasRecord: !!out.record });
  return jsonOk(out);
}
