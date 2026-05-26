// ============================================================
// POST /api/conversations — Registrar conversa WhatsApp como nota/atividade
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection, normalizePhone, phoneSearchPattern, sanitizeSoqlString } from '@/lib/salesforce';
import { conversationSchema } from '@/lib/schemas';
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

  const parsed = conversationSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(`Dados inválidos: ${parsed.error.issues.map(i => i.message).join(', ')}`, 422);
  }

  const data = parsed.data;

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);

    // Se leadId já veio no body, usa direto; senão busca pelo telefone
    let whoId = data.leadId;
    if (!whoId) {
      const pattern = sanitizeSoqlString(phoneSearchPattern(data.phone));
      const result = await conn.query(
        `SELECT Id FROM Lead WHERE Phone LIKE '%${pattern}' OR MobilePhone LIKE '%${pattern}' OR beetalk__PhoneOrMobilePhone__c LIKE '%${pattern}' LIMIT 1`
      );
      if (result.records && result.records.length > 0) {
        whoId = (result.records[0] as Record<string, unknown>).Id as string;
      }
    }

    // Monta descrição da conversa
    const msgText = data.messages?.map(m => `[${m.from}]: ${m.text}`).join('\n') || '';
    const description = [
      `Contato: ${data.contactName}`,
      `Telefone: ${normalizePhone(data.phone)}`,
      data.summary ? `Resumo: ${data.summary}` : '',
      msgText ? `\n--- Mensagens ---\n${msgText}` : '',
    ].filter(Boolean).join('\n');

    const taskRecord: Record<string, string> = {
      Subject: `WhatsApp — ${data.contactName}`,
      Description: description,
      Type: 'WhatsApp',
      Status: 'Completed',
      Priority: 'Normal',
      ActivityDate: new Date().toISOString().split('T')[0],
    };

    if (whoId) taskRecord.WhoId = whoId;

    const result = await conn.sobject('Task').create(taskRecord) as unknown as { success: boolean; id: string; errors: unknown[] };

    if (!result.success) {
      return jsonError(`Salesforce rejeitou: ${JSON.stringify(result.errors)}`, 400);
    }

    return jsonOk({
      taskId: result.id,
      leadId: whoId || null,
      message: 'Conversa registrada com sucesso',
    }, 201);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return jsonError(`Erro ao registrar conversa: ${msg}`, 500);
  }
}
