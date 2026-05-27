// ============================================================
// POST /api/activities — Criar Task de lembrete no Salesforce
//
// Input:
//   { recordId, recordType: 'Lead'|'Opportunity', participantName,
//     reminderDate (YYYY-MM-DD), reminderTime (HH:MM), description? }
//
// Regras:
//   - recordType=Lead → WhoId = recordId
//   - recordType=Opportunity → WhatId = recordId (+ WhoId = ContactId se houver)
//   - Status 'Aberta' (lembrete ainda não feito)
//   - IsReminderSet=true + ReminderDateTime com offset -03:00 (Brasília)
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection, sanitizeSfId } from '@/lib/salesforce';
import { activitySchema } from '@/lib/schemas';
import { createRouteLogger } from '@/lib/logger';
import {
  handleOptions, extractSfCredentials, extractSfCredentialsFromBody,
  validateApiToken, jsonOk, jsonError,
} from '@/lib/api-middleware';

export async function OPTIONS() {
  return handleOptions();
}

export async function POST(req: NextRequest) {
  const log = createRouteLogger('POST /api/activities');

  if (!validateApiToken(req)) {
    return jsonError('Token inválido', 401);
  }

  const body = await req.json().catch(() => null);
  if (!body) return jsonError('Body inválido', 400);

  const creds = extractSfCredentials(req) || await extractSfCredentialsFromBody(body);
  if (!creds) {
    return jsonError('Credenciais Salesforce ausentes', 401);
  }

  const parsed = activitySchema.safeParse(body);
  if (!parsed.success) {
    log.warn('Payload inválido', parsed.error.issues);
    return jsonError(`Dados inválidos: ${parsed.error.issues.map(i => i.message).join(', ')}`, 422);
  }

  const data = parsed.data;

  const safeRecordId = sanitizeSfId(data.recordId);
  if (!safeRecordId) {
    return jsonError('recordId inválido', 422);
  }

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);

    // ── Resolve WhoId / WhatId ────────────────────────────────
    let whoId:  string | null = null;
    let whatId: string | null = null;

    if (data.recordType === 'Lead') {
      whoId = safeRecordId;
    } else {
      whatId = safeRecordId;
      try {
        const r = await conn.query<{ ContactId: string | null }>(
          `SELECT ContactId FROM Opportunity WHERE Id = '${safeRecordId}' LIMIT 1`
        );
        const contactId = r.records?.[0]?.ContactId ?? null;
        if (contactId) whoId = contactId;
      } catch (e) {
        log.warn('Não foi possível buscar ContactId da Opportunity', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // ── Monta ReminderDateTime com offset de Brasília (-03:00) ─
    // SF converte internamente para UTC. Gravar com offset evita erro de 3h.
    const reminderDateTime = `${data.reminderDate}T${data.reminderTime}:00-03:00`;

    const taskRecord: Record<string, string | boolean> = {
      Subject:          `Lembrete - ${data.participantName}`,
      ActivityDate:     data.reminderDate,
      Status:           'Aberta', // label PT — lembrete ainda não feito
      Priority:         'Normal',
      IsReminderSet:    true,
      ReminderDateTime: reminderDateTime,
    };
    if (data.description) taskRecord.Description = data.description;
    if (whoId)  taskRecord.WhoId  = whoId;
    if (whatId) taskRecord.WhatId = whatId;

    log.info('Criando lembrete', {
      recordType: data.recordType,
      recordId:   safeRecordId,
      whoId,
      whatId,
      reminderDateTime,
    });

    const result = await conn.sobject('Task').create(taskRecord) as unknown as {
      success: boolean;
      id: string;
      errors: unknown[];
    };

    if (!result.success) {
      log.fail('Salesforce rejeitou Task de lembrete', result.errors);
      return jsonError(`Salesforce rejeitou: ${JSON.stringify(result.errors)}`, 400);
    }

    log.done('Lembrete criado', { taskId: result.id });

    return jsonOk({
      activityId:       result.id,
      recordId:         safeRecordId,
      recordType:       data.recordType,
      reminderDateTime,
      message:          'Lembrete criado com sucesso',
    }, 201);

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    log.fail('Erro ao criar lembrete', { error: msg });
    return jsonError(`Erro ao criar lembrete: ${msg}`, 500);
  }
}
