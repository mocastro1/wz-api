// ============================================================
// POST /api/leads — Criar Lead no Salesforce
// GET  /api/leads — Listar Leads recentes (opcional)
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection, normalizePhone } from '@/lib/salesforce';
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

    const leadRecord: Record<string, string> = {
      FirstName:  data.FirstName,
      LastName:   data.LastName,
      Company:    data.Company,
      Phone:      normalizePhone(data.Phone),
      Status:     data.Status || 'Novo',
      LeadSource: data.LeadSource,
    };

    if (data.Concessionaria_Ref__c) leadRecord.Concessionaria_Ref__c = data.Concessionaria_Ref__c;
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
