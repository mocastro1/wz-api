// ============================================================
// POST /api/activities — Criar Task/Atividade no Salesforce
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection } from '@/lib/salesforce';
import { activitySchema } from '@/lib/schemas';
import {
  handleOptions, extractSfCredentials, extractSfCredentialsFromBody,
  validateApiToken, jsonOk, jsonError,
} from '@/lib/api-middleware';

export async function OPTIONS() {
  return handleOptions();
}

export async function POST(req: NextRequest) {
  if (!validateApiToken(req)) {
    return jsonError('Token inválido', 401);
  }

  const body = await req.json();

  const creds = extractSfCredentials(req) || await extractSfCredentialsFromBody(body);
  if (!creds) {
    return jsonError('Credenciais Salesforce ausentes', 401);
  }

  const parsed = activitySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(`Dados inválidos: ${parsed.error.issues.map(i => i.message).join(', ')}`, 422);
  }

  const data = parsed.data;

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);

    const taskRecord: Record<string, string> = {
      Subject: data.Subject,
      Priority: data.Priority,
      Status: data.Status,
      Type: data.Type,
    };

    if (data.Description) taskRecord.Description = data.Description;
    if (data.WhoId) taskRecord.WhoId = data.WhoId;
    if (data.WhatId) taskRecord.WhatId = data.WhatId;
    if (data.ActivityDate) taskRecord.ActivityDate = data.ActivityDate;

    const result = await conn.sobject('Task').create(taskRecord) as unknown as { success: boolean; id: string; errors: unknown[] };

    if (!result.success) {
      return jsonError(`Salesforce rejeitou: ${JSON.stringify(result.errors)}`, 400);
    }

    return jsonOk({
      activityId: result.id,
      message: 'Atividade criada com sucesso',
    }, 201);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return jsonError(`Erro ao criar Atividade: ${msg}`, 500);
  }
}
