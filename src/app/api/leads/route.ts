// ============================================================
// POST /api/leads — Criar Lead no Salesforce
// GET  /api/leads — Listar Leads recentes (opcional)
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection, normalizePhone, validateConnection, sanitizeSfId } from '@/lib/salesforce';
import { leadSchema } from '@/lib/schemas';
import { createRouteLogger } from '@/lib/logger';
import {
  handleOptions, extractSfCredentials, extractSfCredentialsFromBody,
  validateApiToken, jsonOk, jsonError,
} from '@/lib/api-middleware';

export async function OPTIONS() {
  return handleOptions();
}

export async function POST(req: NextRequest) {
  const log = createRouteLogger('POST /api/leads');

  if (!validateApiToken(req)) {
    log.warn('Token inválido rejeitado');
    return jsonError('Token inválido', 401);
  }

  const body = await req.json();
  log.info('Criando Lead', { name: `${body.FirstName} ${body.LastName}`, phone: body.Phone });

  // Extrai credenciais SF
  const creds = extractSfCredentials(req) || await extractSfCredentialsFromBody(body);
  if (!creds) {
    log.warn('Credenciais SF ausentes');
    return jsonError('Credenciais Salesforce ausentes. Envie X-SF-Access-Token e X-SF-Instance-Url nos headers.', 401);
  }

  // Valida payload
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    log.warn('Payload inválido', parsed.error.issues);
    return jsonError(`Dados inválidos: ${parsed.error.issues.map(i => i.message).join(', ')}`, 422);
  }

  const data = parsed.data;

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);

    // Concessionária vem SEMPRE do usuário SF logado (não do que a extensão envia).
    // Se o User não tiver Apelido_Concessionaria__c configurado, bloqueia.
    let concessionariaRef = '';
    try {
      const identity = await validateConnection(conn);
      const safeUserId = sanitizeSfId(identity.userId);
      if (safeUserId) {
        const r = await conn.query<{ Apelido_Concessionaria__c: string | null }>(
          `SELECT Apelido_Concessionaria__c FROM User WHERE Id = '${safeUserId}' LIMIT 1`
        );
        concessionariaRef = r.records?.[0]?.Apelido_Concessionaria__c?.trim() || '';
      }
    } catch (e) {
      log.fail('Erro ao buscar concessionária do usuário', { error: e instanceof Error ? e.message : String(e) });
      return jsonError('Não foi possível validar a concessionária do usuário. Tente refazer o login no Salesforce.', 502);
    }

    if (!concessionariaRef) {
      log.warn('Usuário sem concessionária configurada — Lead bloqueado');
      return jsonError('Usuário não possui concessionária configurada. Contate o administrador do sistema.', 422);
    }

    const leadRecord: Record<string, string> = {
      FirstName:  data.FirstName,
      LastName:   data.LastName,
      Company:    data.Company,
      Phone:      normalizePhone(data.Phone),
      Status:     data.Status || 'Novo',
      LeadSource: data.LeadSource,
      Concessionaria_Ref__c: concessionariaRef,
    };

    if (data.Interesse_em__c) leadRecord.Interesse_em__c = data.Interesse_em__c;
    if (data.MobilePhone) leadRecord.MobilePhone = normalizePhone(data.MobilePhone);
    if (data.Description) leadRecord.Description = data.Description;
    if (data.sellerPhone) leadRecord.Description = `${leadRecord.Description || ''}\nVendedor: ${data.sellerPhone}`.trim();

    log.info('Lead record para SF', leadRecord);

    const result = await conn.sobject('Lead').create(leadRecord) as unknown as { success: boolean; id: string; errors: unknown[] };

    if (!result.success) {
      log.fail('Salesforce rejeitou Lead', result.errors);
      return jsonError(`Salesforce rejeitou: ${JSON.stringify(result.errors)}`, 400);
    }

    log.done('Lead criado', { leadId: result.id });
    return jsonOk({
      leadId: result.id,
      message: 'Lead criado com sucesso',
    }, 201);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    log.fail('Erro ao criar Lead', { error: msg });
    return jsonError(`Erro ao criar Lead: ${msg}`, 500);
  }
}
