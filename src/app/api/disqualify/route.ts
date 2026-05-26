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

// ─── Helpers ─────────────────────────────────────────────────

/** Retorna valores ATIVOS do Motivo_de_Perda__c válidos para a origem.
 *  Mesma lógica do endpoint /picklist:
 *  - describe() → activeSet (fonte de verdade)
 *  - GROUP BY por LeadSource → interseciona com activeSet
 *  - Fallback: todos os ativos */
async function getValidMotivos(
  conn: ReturnType<typeof createConnection>,
  objectName: string,
  leadSource: string | null,
): Promise<{ valid: string[]; inactive: string[] }> {
  const meta        = await conn.describe(objectName);
  const motivoField = meta.fields.find((f) => f.name === 'Motivo_de_Perda__c');
  const all         = motivoField?.picklistValues || [];
  const activeSet   = new Set(all.filter((v) => v.active).map((v) => v.value));
  const inactive    = all.filter((v) => !v.active).map((v) => v.value);

  if (leadSource) {
    try {
      const safeSource = leadSource.replace(/'/g, "\\'");
      const r = await conn.query<Record<string, string>>(`
        SELECT Motivo_de_Perda__c
        FROM ${objectName}
        WHERE LeadSource = '${safeSource}'
          AND Motivo_de_Perda__c != null
        GROUP BY Motivo_de_Perda__c
        ORDER BY COUNT(Id) DESC
      `);

      const used = (r.records || [])
        .map((rec) => rec['Motivo_de_Perda__c'])
        .filter((v) => activeSet.has(v));

      if (used.length > 0) {
        return { valid: used, inactive };
      }
    } catch (_) { /* fallback */ }
  }

  return { valid: [...activeSet], inactive };
}

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

  const safeId = sanitizeSfId(data.recordId);
  if (!safeId) {
    return jsonError('recordId inválido', 422);
  }

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);
    const sobjectName = data.objectType; // 'Lead' | 'Opportunity'

    // ── 1. Busca o registro atual (LeadSource + estado) ────────
    let leadSource: string | null = null;
    try {
      const fields = sobjectName === 'Lead'
        ? 'Id, Status, LeadSource, Motivo_de_Perda__c, Desqualificado_Automacao__c'
        : 'Id, StageName, LeadSource, Motivo_de_Perda__c';

      const r = await conn.query<Record<string, unknown>>(
        `SELECT ${fields} FROM ${sobjectName} WHERE Id = '${safeId}' LIMIT 1`
      );
      const rec = r.records?.[0];
      leadSource = (rec?.LeadSource as string) ?? null;
      log.info('Registro atual', { sobjectName, id: safeId, leadSource, rec });
    } catch (e) {
      log.warn('Não foi possível buscar registro antes do update', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // ── 2. Valida motivoDePerda contra active + dependência ────
    try {
      const { valid, inactive } = await getValidMotivos(conn, sobjectName, leadSource);

      log.info(`Validando motivoDePerda`, {
        sobjectName,
        leadSource,
        validCount:   valid.length,
        inactiveCount: inactive.length,
        inactiveValues: inactive,
        recebido:     data.motivoDePerda,
        isInactive:   inactive.includes(data.motivoDePerda),
        isValid:      valid.includes(data.motivoDePerda),
      });

      if (inactive.includes(data.motivoDePerda)) {
        return jsonError(
          `Motivo "${data.motivoDePerda}" está INATIVO em ${sobjectName}. ` +
          `Valores ativos: ${valid.join(', ')}`,
          422
        );
      }

      if (valid.length > 0 && !valid.includes(data.motivoDePerda)) {
        return jsonError(
          `Motivo "${data.motivoDePerda}" não é válido para ${sobjectName}` +
          (leadSource ? ` (origem: ${leadSource})` : '') +
          `. Valores válidos: ${valid.join(', ')}`,
          422
        );
      }
    } catch (validateErr) {
      log.warn('Não foi possível validar picklist — prosseguindo sem validação', {
        error: validateErr instanceof Error ? validateErr.message : String(validateErr),
      });
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
    const result = await conn.sobject(sobjectName).update(updatePayload as never) as unknown as {
      success: boolean;
      id: string;
      errors: unknown[];
    };

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
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    log.fail('Erro ao desqualificar', { error: msg });
    return jsonError(`Erro ao desqualificar: ${msg}`, 500);
  }
}
