// ============================================================
// POST /api/disqualify — Desqualificar Lead ou Oportunidade
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection, sanitizeSfId } from '@/lib/salesforce';
import { createRouteLogger } from '@/lib/logger';
import {
  handleOptions, extractSfCredentials, extractSfCredentialsFromBody,
  validateApiToken, jsonOk, jsonError,
} from '@/lib/api-middleware';
import { getValidMotivosForOrigin } from '@/lib/motivo-perda';
import { withTimeout, SF_TIMEOUT, isSfTimeout } from '@/lib/sf-timeout';
import { checkRateLimit } from '@/lib/rate-limit-middleware';
import { z } from 'zod';

export async function OPTIONS() {
  return handleOptions();
}

// ─── Schema de validação ──────────────────────────────────────
const disqualifySchema = z.discriminatedUnion('objectType', [
  z.object({
    objectType:    z.literal('Lead'),
    recordId:      z.string().min(15).max(18),
    motivoDePerda: z.string().min(1, 'Motivo de perda é obrigatório'),
  }),
  z.object({
    objectType:    z.literal('Opportunity'),
    recordId:      z.string().min(15).max(18),
    motivoDePerda: z.string().min(1, 'Motivo de perda é obrigatório'),
  }),
]);

// Validação usa getValidMotivosForOrigin (em ./picklist/route) que decodifica
// o bitmask ValidFor com a ORDEM correta do PicklistValueInfo — não do describe,
// cuja ordem difere e gerava motivos inválidos.

// ─── POST — Executa a desqualificação ────────────────────────
export async function POST(req: NextRequest) {
  const log = createRouteLogger('POST /api/disqualify');

  if (!validateApiToken(req)) {
    return jsonError('Token inválido', 401);
  }

  const rl = checkRateLimit(req, 'write', 'disqualify');
  if (rl) return rl;

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

  const safeId = sanitizeSfId(data.recordId);
  if (!safeId) {
    return jsonError('recordId inválido', 422);
  }

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);
    const sobjectName = data.objectType; // 'Lead' | 'Opportunity'

    // ── 1. Busca o registro atual (LeadSource obrigatório) ─────
    let leadSource: string | null = null;
    try {
      const fields = sobjectName === 'Lead'
        ? 'Id, Status, LeadSource, Motivo_de_Perda__c, Desqualificado_Automacao__c'
        : 'Id, StageName, LeadSource, Motivo_de_Perda__c';

      const r = await withTimeout(
        conn.query<Record<string, unknown>>(
          `SELECT ${fields} FROM ${sobjectName} WHERE Id = '${safeId}' LIMIT 1`
        ),
        SF_TIMEOUT.query,
        `query ${sobjectName} pre-update`,
      );
      const rec = r.records?.[0];
      if (!rec) {
        return jsonError(`${sobjectName} ${safeId} não encontrado`, 404);
      }
      leadSource = (rec.LeadSource as string) ?? null;
      log.info('Registro atual', { sobjectName, id: safeId, leadSource });
    } catch (e) {
      if (isSfTimeout(e)) {
        log.fail('Timeout ao buscar registro', { op: e.op, ms: e.ms });
        return jsonError('Salesforce demorou demais para responder. Tente novamente.', 504);
      }
      log.fail('Erro ao buscar registro antes do update', {
        error: e instanceof Error ? e.message : String(e),
      });
      return jsonError('Não foi possível ler o registro no Salesforce. Tente novamente.', 502);
    }

    if (!leadSource) {
      return jsonError(
        `${sobjectName} sem origem (LeadSource) — não é possível validar o motivo de perda.`,
        422
      );
    }

    // ── 2. Valida motivoDePerda contra a dependência (obrigatório) ──
    // Se a validação falhar por erro técnico, BLOQUEIA (não deixa passar)
    // para evitar enviar motivo inválido e causar erro 500 no SF.
    let validValues: string[];
    try {
      const valid = await getValidMotivosForOrigin(conn, sobjectName, leadSource);
      validValues = valid.map((v) => v.value);
    } catch (validateErr) {
      log.fail('Erro ao validar motivo contra picklist dependente', {
        error: validateErr instanceof Error ? validateErr.message : String(validateErr),
      });
      return jsonError(
        'Não foi possível validar o motivo de perda contra a configuração do Salesforce. Tente novamente.',
        502
      );
    }

    log.info('Validando motivoDePerda', {
      sobjectName,
      leadSource,
      validCount: validValues.length,
      recebido:   data.motivoDePerda,
      isValid:    validValues.includes(data.motivoDePerda),
    });

    if (!validValues.includes(data.motivoDePerda)) {
      return jsonError(
        `Motivo "${data.motivoDePerda}" não é válido para ${sobjectName} com origem "${leadSource}". ` +
        `Valores válidos: ${validValues.join(', ')}`,
        422
      );
    }

    // ── 3. Monta payload do update ─────────────────────────────
    let updatePayload: Record<string, unknown>;

    if (sobjectName === 'Lead') {
      updatePayload = {
        Id:                          safeId,
        Status:                      'Não qualificado',
        Motivo_de_Perda__c:          data.motivoDePerda,
        Desqualificado_Automacao__c:  true,
      };
    } else {
      updatePayload = {
        Id:                 safeId,
        StageName:          'Negociação perdida',
        Motivo_de_Perda__c: data.motivoDePerda,
      };
    }

    log.info(`Desqualificando ${sobjectName}`, { id: safeId, leadSource, payload: updatePayload });

    // ── 4. Executa o update ────────────────────────────────────
    const result = await withTimeout(
      conn.sobject(sobjectName).update(updatePayload as never) as unknown as Promise<{
        success: boolean;
        id: string;
        errors: unknown[];
      }>,
      SF_TIMEOUT.update,
      `update ${sobjectName}`,
    );

    log.info('Resposta SF update', { success: result.success, errors: result.errors });

    if (!result.success) {
      log.fail(`Salesforce rejeitou update de ${sobjectName}`, result.errors);
      return jsonError(`Salesforce rejeitou: ${JSON.stringify(result.errors)}`, 400);
    }

    // ── 5. Verifica se o estado persistiu ─────────────────────
    let verification: Record<string, unknown> | null = null;
    let actuallyDisqualified = false;
    try {
      if (sobjectName === 'Lead') {
        const r = await conn.query<Record<string, unknown>>(
          `SELECT Id, Status, Motivo_de_Perda__c, Desqualificado_Automacao__c FROM Lead WHERE Id = '${safeId}' LIMIT 1`
        );
        verification = r.records?.[0] ?? null;
        actuallyDisqualified = verification?.Status === 'Não qualificado'
                            && !!verification?.Motivo_de_Perda__c
                            && verification?.Desqualificado_Automacao__c === true;
      } else {
        const r = await conn.query<Record<string, unknown>>(
          `SELECT Id, StageName, Motivo_de_Perda__c FROM Opportunity WHERE Id = '${safeId}' LIMIT 1`
        );
        verification = r.records?.[0] ?? null;
        actuallyDisqualified = verification?.StageName === 'Negociação perdida'
                            && !!verification?.Motivo_de_Perda__c;
      }
    } catch (verifyErr) {
      log.warn('Não foi possível verificar pós-update', {
        error: verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
      });
    }

    log.done(`${sobjectName} desqualificado`, { id: safeId, actuallyDisqualified, verification });

    if (!actuallyDisqualified && verification) {
      return jsonError(
        `Update aceito mas registro não ficou desqualificado. Estado atual: ${JSON.stringify(verification)}. ` +
        `Verifique se "${sobjectName === 'Lead' ? 'Não qualificado' : 'Negociação perdida'}" ` +
        `existe exatamente assim no ${sobjectName} (case-sensitive).`,
        409
      );
    }

    return jsonOk({
      recordId:   safeId,
      objectType: sobjectName,
      leadSource,
      verification,
      message:    `${sobjectName} desqualificado com sucesso`,
    });

  } catch (e: unknown) {
    if (isSfTimeout(e)) {
      log.fail('Timeout no Salesforce', { op: e.op, ms: e.ms });
      return jsonError('Salesforce demorou demais para responder. Tente novamente.', 504);
    }
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    log.fail('Erro ao desqualificar', { error: msg });
    return jsonError(`Erro ao desqualificar: ${msg}`, 500);
  }
}
