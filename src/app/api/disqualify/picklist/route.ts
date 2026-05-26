// ============================================================
// GET /api/disqualify/picklist?object=Lead|Opportunity&recordId=...
//
// Lógica:
//   1. describe() → coleta todos os valores com active == true (fonte de verdade)
//   2. Busca LeadSource do registro (se recordId informado)
//   3. GROUP BY Motivo_de_Perda__c WHERE LeadSource = '...' → motivos já usados
//      para aquela origem — interseciona com os ativos do describe()
//   4. Fallback: se intersecção vazia → retorna todos os ativos
//
// REGRA: nunca retornar valor com active == false — causa erro 500 no SF
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

  const fieldName = 'Motivo_de_Perda__c';

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);

    // ── 1. describe() — fonte de verdade dos valores permitidos ─
    const meta         = await conn.describe(objectName);
    const motivoField  = meta.fields.find((f) => f.name.toLowerCase() === fieldName.toLowerCase());

    if (!motivoField) {
      return jsonError(`Campo "${fieldName}" não encontrado em ${objectName}`, 404);
    }

    const allValues     = motivoField.picklistValues || [];
    const activeSet     = new Set(allValues.filter((v) => v.active).map((v) => v.value));
    const inactiveVals  = allValues.filter((v) => !v.active).map((v) => v.value);

    log.info(`describe() ${fieldName} (${objectName})`, {
      active:         activeSet.size,
      inactive:       inactiveVals.length,
      inactiveValues: inactiveVals,
    });

    if (activeSet.size === 0) {
      return jsonError(`Nenhum valor ativo no campo "${fieldName}" de ${objectName}`, 400);
    }

    // ── 2. Busca LeadSource do registro ───────────────────────
    let leadSource: string | null = null;

    if (recordId) {
      const safeId = sanitizeSfId(recordId);
      if (safeId) {
        try {
          const r = await conn.query<{ LeadSource: string | null }>(
            `SELECT LeadSource FROM ${objectName} WHERE Id = '${safeId}' LIMIT 1`
          );
          leadSource = r.records?.[0]?.LeadSource ?? null;
          log.info('LeadSource do registro', { objectName, recordId: safeId, leadSource });
        } catch (e) {
          log.warn('Não foi possível buscar LeadSource', {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    // ── 3. Motivos usados para aquela origem ∩ ativos ─────────
    if (leadSource) {
      try {
        const safeSource = leadSource.replace(/'/g, "\\'");
        const r = await conn.query<Record<string, string>>(`
          SELECT ${fieldName}
          FROM ${objectName}
          WHERE LeadSource = '${safeSource}'
            AND ${fieldName} != null
          GROUP BY ${fieldName}
          ORDER BY COUNT(Id) DESC
        `);

        if (r.records && r.records.length > 0) {
          // Interseciona com ativos — descarta histórico de valores inativos
          const usedValues = r.records
            .map((rec) => rec[fieldName])
            .filter((v) => activeSet.has(v));

          log.info(`Motivos usados para LeadSource "${leadSource}"`, {
            totalHistorico: r.records.length,
            aposFiltragem:  usedValues.length,
            descartados:    r.records.map(rec => rec[fieldName]).filter(v => !activeSet.has(v)),
            values:         usedValues,
          });

          if (usedValues.length > 0) {
            const values = usedValues.map((v) => ({ value: v, label: v }));
            log.done(`Picklist por origem "${leadSource}" (${objectName})`, { count: values.length });
            return jsonOk({
              object:     objectName,
              field:      fieldName,
              leadSource,
              values,
              source:     'leadSource-active-intersection',
            });
          }

          log.warn(`Nenhum motivo ativo encontrado para origem "${leadSource}" — usando fallback`);
        } else {
          log.warn(`Nenhum histórico de motivos para origem "${leadSource}" — usando fallback`);
        }
      } catch (e) {
        log.warn('Query por LeadSource falhou — usando fallback', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // ── 4. Fallback — todos os ativos ─────────────────────────
    const values = [...activeSet].map((v) => ({ value: v, label: v }));

    log.done(`Picklist fallback ${fieldName} (${objectName}) — ${values.length} ativos`, { leadSource });
    return jsonOk({
      object:     objectName,
      field:      fieldName,
      leadSource: leadSource ?? null,
      values,
      source:     'describe-all-active',
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    log.fail('Erro ao buscar picklist de desqualificação', { error: msg });
    return jsonError(`Erro: ${msg}`, 500);
  }
}
