// ============================================================
// POST /api/contacts — Criar/registrar Contato no Salesforce
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection, normalizePhone } from '@/lib/salesforce';
import { contactSchema } from '@/lib/schemas';
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

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(`Dados inválidos: ${parsed.error.issues.map(i => i.message).join(', ')}`, 422);
  }

  const data = parsed.data;

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);

    const contactRecord: Record<string, string> = {
      FirstName: data.FirstName,
      LastName: data.LastName,
      Phone: normalizePhone(data.Phone),
    };

    if (data.MobilePhone) contactRecord.MobilePhone = normalizePhone(data.MobilePhone);
    if (data.Email) contactRecord.Email = data.Email;
    if (data.Description) contactRecord.Description = data.Description;
    if (data.AccountId) contactRecord.AccountId = data.AccountId;

    const result = await conn.sobject('Contact').create(contactRecord) as unknown as { success: boolean; id: string; errors: unknown[] };

    if (!result.success) {
      return jsonError(`Salesforce rejeitou: ${JSON.stringify(result.errors)}`, 400);
    }

    return jsonOk({
      contactId: result.id,
      message: 'Contato criado com sucesso',
    }, 201);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return jsonError(`Erro ao criar Contato: ${msg}`, 500);
  }
}
