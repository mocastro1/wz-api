// ============================================================
// POST /api/leads/lookup — Buscar Lead por telefone
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection, phoneSearchPattern } from '@/lib/salesforce';
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

    // Busca apenas Leads ATIVOS:
    //   - não convertidos (IsConverted = false)
    //   - não desqualificados automaticamente (Desqualificado_Automacao__c = false)
    // Leads inativos não devem aparecer no badge — eles liberam o "Salvar como Lead" novamente.
    const soql = `
      SELECT Id, Name, FirstName, LastName, Phone, MobilePhone,
             beetalk__PhoneOrMobilePhone__c, Status, LeadSource,
             Company, OwnerId, Owner.Name, CreatedDate,
             IsConverted, ConvertedOpportunityId,
             Motivo_de_Perda__c
      FROM Lead
      WHERE (Phone LIKE '%${pattern}'
          OR MobilePhone LIKE '%${pattern}'
          OR beetalk__PhoneOrMobilePhone__c LIKE '%${pattern}')
        AND IsConverted = false
        AND Desqualificado_Automacao__c = false
      ORDER BY CreatedDate DESC
      LIMIT 5
    `;

    // Em paralelo: busca Oportunidades ATIVAS (não fechadas) pelo telefone do Contact relacionado
    // Critério da regra de negócio: IsClosed = false (Opp aberta = ativa)
    const oppSoql = `
      SELECT Id, Name, StageName, IsClosed,
             COTACAO_FATURADA__C, MOTIVO_DE_PERDA__C,
             Amount, CloseDate, OwnerId, Owner.Name,
             AccountId, ContactId,
             Account.PersonMobilePhone, Account.Phone
      FROM Opportunity
      WHERE IsClosed = false
        AND (Account.PersonMobilePhone LIKE '%${pattern}'
          OR Account.Phone LIKE '%${pattern}')
      ORDER BY CreatedDate DESC
      LIMIT 5
    `;

    const leadResult = await conn.query(soql);
    let oppRecords: Record<string, unknown>[] = [];
    try {
      const oppResult = await conn.query(oppSoql);
      oppRecords = (oppResult.records as Record<string, unknown>[]) || [];
    } catch (_) {
      // Org pode não ter Account.PersonMobilePhone se não usa Person Accounts
      oppRecords = [];
    }

    const leadRecords = leadResult.records || [];

    if (leadRecords.length === 0 && oppRecords.length === 0) {
      return jsonOk({ found: false, leads: [] });
    }

    // Mapeia Oportunidades ativas para um array
    const opportunities = oppRecords.map((o: Record<string, unknown>) => ({
      oppId:           o.Id,
      oppName:         o.Name,
      stageName:       o.StageName,
      isClosed:        o.IsClosed || false,
      cotacaoFaturada: o.COTACAO_FATURADA__C || false,
      motivoPerda:     o.MOTIVO_DE_PERDA__C || null,
      amount:          o.Amount,
      closeDate:       o.CloseDate,
      ownerId:         o.OwnerId,
      ownerName:       (o.Owner as Record<string, unknown>)?.Name || '',
      oppUrl:          `${creds.instanceUrl}/lightning/r/Opportunity/${o.Id}/view`,
    }));

    const leads = leadRecords.map((r: Record<string, unknown>) => ({
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
      motivoPerda:   r.Motivo_de_Perda__c || null,
      encerrado:     false,
      // Anexa a primeira Oportunidade ativa encontrada (compat com o front antigo)
      opportunity:   opportunities[0] || null,
    }));

    log.done(`Lookup retornou`, {
      activeLeads: leads.length,
      activeOpps:  opportunities.length,
    });
    return jsonOk({
      found: true,
      count: leads.length,
      leads,
      opportunities,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    log.fail('Erro na busca SOQL', { error: msg });
    return jsonError(`Erro na busca: ${msg}`, 500);
  }
}
