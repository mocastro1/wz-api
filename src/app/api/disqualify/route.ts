// ============================================================
// POST /api/disqualify — Desqualificar Lead ou Oportunidade
// GET  /api/disqualify/picklist?object=Lead|Opportunity
//      Retorna valores do campo Motivo_de_Perda__c via describe
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection, sanitizeSfId } from '@/lib/salesforce';
import { createRouteLogger } from '@/lib/logger';
import {
  handleOptions, extractSfCredentials, extractSfCredentialsFromBody,
  validateApiToken, jsonOk, jsonError,
} from '@/lib/api-middleware';
import { z } from 'zod';

export async function OPTIONS() {
  return handleOptions();
}

// ─── Schema de validação ──────────────────────────────────────
const disqualifySchema = z.discriminatedUnion('objectType', [
  z.object({
    objectType:       z.literal('Lead'),
    recordId:         z.string().min(15).max(18),
    motivoDePerda:    z.string().min(1, 'Motivo de perda é obrigatório'),
  }),
  z.object({
    objectType:       z.literal('Opportunity'),
    recordId:         z.string().min(15).max(18),
    motivoDePerda:    z.string().min(1, 'Motivo de perda é obrigatório'),
  }),
]);

// ─── POST — Executa a desqualificação ────────────────────────
export async function POST(req: NextRequest) {
  const log = createRouteLogger('POST /api/disqualify');

  if (!validateApiToken(req)) {
    return jsonError('Token inválido', 401);
  }

  const body = await req.json().catch(() => null);
  if (!body) return jsonError('Body inválido', 400);

  const parsed = disqualifySchema.safeParse(body);
  if (!parsed.success) {
    log.warn('Payload inválido', parsed.error.issues);
    return jsonError(`Dados inválidos: ${parsed.error.issues.map(i => i.message).join(', ')}`, 422);
  }

  const data = parsed.data;

  const creds = extractSfCredentials(req) || await extractSfCredentialsFromBody(body);
  if (!creds) {
    return jsonError('Credenciais Salesforce ausentes', 401);
  }

  // Sanitiza ID para evitar SOQL injection
  const safeId = sanitizeSfId(data.recordId);
  if (!safeId) {
    return jsonError('recordId inválido', 422);
  }

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);

    let updatePayload: Record<string, string>;
    let sobjectName: string;

    if (data.objectType === 'Lead') {
      sobjectName = 'Lead';
      updatePayload = {
        Id:                safeId,
        Status:            'Não qualificado',
        Motivo_de_Perda__c: data.motivoDePerda,
      };
    } else {
      sobjectName = 'Opportunity';
      updatePayload = {
        Id:                safeId,
        StageName:         'Negociação perdida',
        Motivo_de_Perda__c: data.motivoDePerda,
      };
    }

    log.info(`Desqualificando ${sobjectName}`, { id: safeId, motivo: data.motivoDePerda });

    const result = await conn.sobject(sobjectName).update(updatePayload) as unknown as {
      success: boolean;
      id: string;
      errors: unknown[];
    };

    if (!result.success) {
      log.fail(`Salesforce rejeitou update de ${sobjectName}`, result.errors);
      return jsonError(`Salesforce rejeitou: ${JSON.stringify(result.errors)}`, 400);
    }

    log.done(`${sobjectName} desqualificado`, { id: safeId });
    return jsonOk({
      recordId:   safeId,
      objectType: data.objectType,
      message:    `${sobjectName} desqualificado com sucesso`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    log.fail('Erro ao desqualificar', { error: msg });
    return jsonError(`Erro ao desqualificar: ${msg}`, 500);
  }
}
