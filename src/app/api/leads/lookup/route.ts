// ============================================================
// POST /api/leads/lookup — Buscar Lead por telefone
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection, phoneSoslVariants, sanitizeSfId } from '@/lib/salesforce';
import { lookupSchema } from '@/lib/schemas';
import { createRouteLogger } from '@/lib/logger';
import { withTimeout, SF_TIMEOUT, isSfTimeout } from '@/lib/sf-timeout';
import { checkRateLimit } from '@/lib/rate-limit-middleware';
import {
  handleOptions, extractSfCredentials, extractSfCredentialsFromBody,
  validateApiToken, jsonOk, jsonError,
} from '@/lib/api-middleware';

// Registro retornado pelo SOSL: cada hit traz attributes.type ('Lead' | 'Account' …)
// para distinguir o sObject. Demais campos vêm conforme o RETURNING.
type SoslRecord = { attributes?: { type?: string }; Id?: string; [k: string]: unknown };

export async function OPTIONS() {
  return handleOptions();
}

export async function POST(req: NextRequest) {
  const log = createRouteLogger('POST /api/leads/lookup');

  if (!validateApiToken(req)) {
    log.warn('Token inválido rejeitado');
    return jsonError('Token inválido', 401);
  }

  const rl = checkRateLimit(req, 'lookup', 'lookup');
  if (rl) return rl;

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

  // Variantes do número nacional (DDD+número), só dígitos, para o SOSL.
  // phoneSoslVariants já lida com a ambiguidade do 9º dígito (BR) e remove
  // qualquer formatação — o termo é numérico puro, seguro de interpolar no SOSL.
  const variants = phoneSoslVariants(parsed.data.phone);
  log.debug('Variantes SOSL', { variants, instanceUrl: creds.instanceUrl });

  // Telefone curto/inválido → nada a buscar.
  if (variants.length === 0) {
    return jsonOk({ found: false, leads: [] });
  }

  // FIND {<variante1> OR <variante2>} — cobre celular com e sem o 9.
  const findTerm = variants.join(' OR ');

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);

    // ─── Busca via SOSL (índice de busca, NÃO full table scan) ──────────────
    // O LIKE '%...' antigo forçava full scan em produção: curinga à ESQUERDA
    // não usa índice, então em orgs grandes a query varria a tabela inteira.
    // SOSL "IN PHONE FIELDS" usa o índice de busca do Salesforce e já normaliza
    // números de telefone (remove formatação) — escala bem em produção.
    //
    // Em UMA chamada o SOSL retorna:
    //   - Leads ATIVOS: não convertidos e Status != 'Não qualificado'
    //     (cobre desqualificação manual E via extensão — ambas setam o Status).
    //   - Accounts cujo telefone bate (Person Accounts via PersonMobilePhone e
    //     contas comuns via Phone) — usados abaixo para achar as Oportunidades.
    const sosl = `
      FIND {${findTerm}} IN PHONE FIELDS RETURNING
        Lead(Id, Name, FirstName, LastName, Phone, MobilePhone,
             beetalk__PhoneOrMobilePhone__c, Status, LeadSource, Company,
             OwnerId, Owner.Name, CreatedDate, IsConverted,
             ConvertedOpportunityId, Motivo_de_Perda__c, Modelo__r.Name
             WHERE IsConverted = false
               AND Status != 'Não qualificado'
             ORDER BY CreatedDate DESC LIMIT 5),
        Account(Id LIMIT 50)
    `;

    const search = await withTimeout(conn.search(sosl), SF_TIMEOUT.query, 'lookup sosl');
    const hits = (search.searchRecords as SoslRecord[]) || [];

    let leadRecords = hits.filter((r) => r.attributes?.type === 'Lead');
    const accountIds = hits
      .filter((r) => r.attributes?.type === 'Account')
      .map((r) => sanitizeSfId(r.Id))
      .filter(Boolean);

    // ─── Fallback p/ o lag de indexação do SOSL ────────────────────────────
    // O índice de busca do SOSL tem latência de alguns segundos: um Lead
    // recém-criado pode ainda não estar indexado e não aparecer acima — o que
    // quebraria o badge de dedup logo após salvar um Lead.
    // Quando o SOSL não acha Lead, caímos num SOQL restrito aos Leads RECENTES
    // (CreatedDate é indexado → consulta seletiva e barata, sem full scan).
    // O LIKE '%variante' aqui é seguro: variantes são dígitos puros.
    if (leadRecords.length === 0) {
      const likeClauses = variants
        .flatMap((v) => [
          `Phone LIKE '%${v}'`,
          `MobilePhone LIKE '%${v}'`,
          `beetalk__PhoneOrMobilePhone__c LIKE '%${v}'`,
        ])
        .join(' OR ');
      const fallbackSoql = `
        SELECT Id, Name, FirstName, LastName, Phone, MobilePhone,
               beetalk__PhoneOrMobilePhone__c, Status, LeadSource, Company,
               OwnerId, Owner.Name, CreatedDate, IsConverted,
               ConvertedOpportunityId, Motivo_de_Perda__c, Modelo__r.Name
        FROM Lead
        WHERE CreatedDate = LAST_N_DAYS:1
          AND IsConverted = false
          AND Status != 'Não qualificado'
          AND (${likeClauses})
        ORDER BY CreatedDate DESC
        LIMIT 5
      `;
      try {
        const fb = await withTimeout(conn.query(fallbackSoql), SF_TIMEOUT.query, 'lookup lead fallback');
        leadRecords = (fb.records as SoslRecord[]) || [];
        if (leadRecords.length > 0) {
          log.info('Lead achado via fallback SOQL (provável lag de indexação do SOSL)');
        }
      } catch (e) {
        if (isSfTimeout(e)) throw e; // timeout deve propagar
        // qualquer outro erro no fallback não deve derrubar o lookup principal
      }
    }

    // Oportunidades ATIVAS (IsClosed = false) das contas encontradas.
    // AccountId é FK INDEXADA, então este SELECT é rápido — bem diferente do
    // LIKE '%...' sobre Account.PersonMobilePhone do código antigo.
    // Só roda se o SOSL achou alguma conta pelo telefone.
    let oppRecords: Record<string, unknown>[] = [];
    if (accountIds.length > 0) {
      const idList = accountIds.map((id) => `'${id}'`).join(',');
      const oppSoql = `
        SELECT Id, Name, StageName, IsClosed,
               COTACAO_FATURADA__C, MOTIVO_DE_PERDA__C,
               Amount, CloseDate, OwnerId, Owner.Name,
               AccountId, ContactId, Modelo__r.Name,
               Account.PersonMobilePhone, Account.Phone
        FROM Opportunity
        WHERE IsClosed = false
          AND AccountId IN (${idList})
        ORDER BY CreatedDate DESC
        LIMIT 5
      `;
      try {
        const oppResult = await withTimeout(conn.query(oppSoql), SF_TIMEOUT.query, 'lookup opp');
        oppRecords = (oppResult.records as Record<string, unknown>[]) || [];
      } catch (e) {
        if (isSfTimeout(e)) throw e; // timeout deve propagar (não silenciar)
        oppRecords = [];
      }
    }

    if (leadRecords.length === 0 && oppRecords.length === 0) {
      return jsonOk({ found: false, leads: [] });
    }

    // Mapeia Oportunidades ativas para um array
    const opportunities = oppRecords.map((o: Record<string, unknown>) => ({
      oppId:           o.Id,
      oppName:         o.Name,
      stageName:       o.StageName,
      modelo:          (o.Modelo__r as Record<string, unknown>)?.Name || null,
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
      modelo:        (r.Modelo__r as Record<string, unknown>)?.Name || null,
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
    if (isSfTimeout(e)) {
      log.fail('Timeout no Salesforce', { op: e.op, ms: e.ms });
      return jsonError('Salesforce demorou demais para responder. Tente novamente.', 504);
    }
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    log.fail('Erro na busca SOQL', { error: msg });
    return jsonError(`Erro na busca: ${msg}`, 500);
  }
}
