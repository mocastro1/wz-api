// ============================================================
// POST /api/leads/lookup — Buscar Lead por telefone
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection, phoneSearchPattern, sanitizeSfId } from '@/lib/salesforce';
import { lookupSchema } from '@/lib/schemas';
import { createRouteLogger } from '@/lib/logger';
import {
  handleOptions, extractSfCredentials, extractSfCredentialsFromBody,
  validateApiToken, jsonOk, jsonError,
} from '@/lib/api-middleware';

export async function OPTIONS() {
  return handleOptions();
}

export async function POST(req: NextRequest) {
  const log = createRouteLogger('POST /api/leads/lookup');

  if (!validateApiToken(req)) {
    log.warn('Token inválido rejeitado');
    return jsonError('Token inválido', 401);
  }

  const body = await req.json();
  log.info('Buscando lead', { phone: body.phone });

  const creds = extractSfCredentials(req) || await extractSfCredentialsFromBody(body);
  if (!creds) {
    log.warn('Credenciais SF ausentes');
    return jsonError('Credenciais Salesforce ausentes', 401);
  }

  const parsed = lookupSchema.safeParse(body);
  if (!parsed.success) {
    log.warn('Payload inválido', parsed.error.issues);
    return jsonError(`Dados inválidos: ${parsed.error.issues.map(i => i.message).join(', ')}`, 422);
  }

  const pattern = phoneSearchPattern(parsed.data.phone);
  log.debug('Pattern SOQL', { pattern, instanceUrl: creds.instanceUrl });

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);

    // Busca Lead por telefone (últimos 11 dígitos) em múltiplos campos
    const soql = `
      SELECT Id, Name, FirstName, LastName, Phone, MobilePhone,
             beetalk__PhoneOrMobilePhone__c, Status, LeadSource,
             Company, OwnerId, Owner.Name, CreatedDate,
             IsConverted, ConvertedOpportunityId,
             Motivo_de_Perda__c
      FROM Lead
      WHERE Phone LIKE '%${pattern}'
         OR MobilePhone LIKE '%${pattern}'
         OR beetalk__PhoneOrMobilePhone__c LIKE '%${pattern}'
      ORDER BY CreatedDate DESC
      LIMIT 5
    `;

    const result = await conn.query(soql);

    if (!result.records || result.records.length === 0) {
      return jsonOk({ found: false, leads: [] });
    }

    // Para leads convertidos, busca dados da Oportunidade
    const leads = await Promise.all(result.records.map(async (r: Record<string, unknown>) => {
      const lead: Record<string, unknown> = {
        leadId:        r.Id,
        leadName:      r.Name,
        firstName:     r.FirstName,
        lastName:      r.LastName,
        phone:         r.Phone,
        mobilePhone:   r.MobilePhone,
        leadStatus:    r.Status,
        leadSource:    r.LeadSource,
        company:       r.Company,
        ownerId:       r.OwnerId,
        ownerName:     (r.Owner as Record<string, unknown>)?.Name || '',
        leadUrl:       `${creds.instanceUrl}/lightning/r/Lead/${r.Id}/view`,
        isConverted:   r.IsConverted || false,
        opportunityId: r.ConvertedOpportunityId || null,
        motivoPerda:   r.Motivo_de_Perda__c || null,
        encerrado:     !!r.Motivo_de_Perda__c,
        opportunity:   null as Record<string, unknown> | null,
      };

      // Se o lead foi convertido, busca a Oportunidade
      if (r.ConvertedOpportunityId) {
        const safeOppId = sanitizeSfId(r.ConvertedOpportunityId);
        if (safeOppId) {
        try {
          const oppResult = await conn.query(`
            SELECT Id, Name, StageName,
                   COTACAO_FATURADA__C, MOTIVO_DE_PERDA__C,
                   Amount, CloseDate, OwnerId, Owner.Name
            FROM Opportunity
            WHERE Id = '${safeOppId}'
            LIMIT 1
          `);
          if (oppResult.records?.length > 0) {
            const opp = oppResult.records[0] as Record<string, unknown>;
            lead.opportunity = {
              oppId:           opp.Id,
              oppName:         opp.Name,
              stageName:       opp.StageName,
              cotacaoFaturada: opp.COTACAO_FATURADA__C || false,
              motivoPerda:     opp.MOTIVO_DE_PERDA__C || null,
              amount:          opp.Amount,
              closeDate:       opp.CloseDate,
              ownerId:         opp.OwnerId,
              ownerName:       (opp.Owner as Record<string, unknown>)?.Name || '',
              oppUrl:          `${creds.instanceUrl}/lightning/r/Opportunity/${opp.Id}/view`,
            };
            // Lead encerrado se: oportunidade faturada OU motivo de perda na opp OU motivo de perda no lead
            const opp2 = lead.opportunity as Record<string, unknown>;
            lead.encerrado = !!(opp2.cotacaoFaturada || opp2.motivoPerda || lead.motivoPerda);
          }
        } catch (_) {
          // Silencia erro de permissão na Oportunidade
        }
        } // end if safeOppId
      }

      return lead;
    }));

    log.done(`${leads.length} lead(s) encontrado(s)`, { count: leads.length, ids: leads.map(l => l.leadId) });
    return jsonOk({
      found: true,
      count: leads.length,
      leads,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    log.fail('Erro na busca SOQL', { error: msg });
    return jsonError(`Erro na busca: ${msg}`, 500);
  }
}
