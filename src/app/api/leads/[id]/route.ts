// ============================================================
// GET /api/leads/[id] — Buscar Lead por ID
// PATCH /api/leads/[id] — Atualizar Lead
// DELETE /api/leads/[id] — (futuro) Excluir Lead
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection } from '@/lib/salesforce';
import {
  handleOptions, extractSfCredentials,
  validateApiToken, jsonOk, jsonError,
} from '@/lib/api-middleware';

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateApiToken(req)) {
    return jsonError('Token inválido', 401);
  }

  const creds = extractSfCredentials(req);
  if (!creds) {
    return jsonError('Credenciais Salesforce ausentes', 401);
  }

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);
    const lead = await conn.sobject('Lead').retrieve(params.id);

    return jsonOk({ lead });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return jsonError(`Erro ao buscar Lead: ${msg}`, 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateApiToken(req)) {
    return jsonError('Token inválido', 401);
  }

  const creds = extractSfCredentials(req);
  if (!creds) {
    return jsonError('Credenciais Salesforce ausentes', 401);
  }

  const body = await req.json();

  // Remove campos que não devem ser atualizados diretamente
  const { Id: _Id, id: _id, sfAccessToken: _t, sfInstanceUrl: _u, sfTokenType: _tt, ...updateData } = body;

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);
    const result = await conn.sobject('Lead').update({
      Id: params.id,
      ...updateData,
    }) as unknown as { success: boolean; errors: unknown[] };

    if (!result.success) {
      return jsonError(`Salesforce rejeitou: ${JSON.stringify(result.errors)}`, 400);
    }

    return jsonOk({ message: 'Lead atualizado', leadId: params.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return jsonError(`Erro ao atualizar Lead: ${msg}`, 500);
  }
}
