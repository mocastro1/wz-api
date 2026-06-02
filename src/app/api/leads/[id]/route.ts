// ============================================================
// GET /api/leads/[id] — Buscar Lead por ID
// PATCH /api/leads/[id] — Atualizar Lead
// DELETE /api/leads/[id] — (futuro) Excluir Lead
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection, sanitizeSfId } from '@/lib/salesforce';
import { leadPatchSchema } from '@/lib/schemas';
import {
  handleOptions, extractSfCredentials,
  validateApiToken, jsonOk, jsonError,
} from '@/lib/api-middleware';
import { checkRateLimit } from '@/lib/rate-limit-middleware';

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

  const rl = checkRateLimit(req, 'metadata', 'leads-id');
  if (rl) return rl;

  const creds = extractSfCredentials(req);
  if (!creds) {
    return jsonError('Credenciais Salesforce ausentes', 401);
  }

  const id = sanitizeSfId(params.id);
  if (!id) return jsonError('ID de Lead inválido', 422);

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);
    const lead = await conn.sobject('Lead').retrieve(id);

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

  const rl = checkRateLimit(req, 'metadata', 'leads-id');
  if (rl) return rl;

  const creds = extractSfCredentials(req);
  if (!creds) {
    return jsonError('Credenciais Salesforce ausentes', 401);
  }

  const id = sanitizeSfId(params.id);
  if (!id) return jsonError('ID de Lead inválido', 422);

  const body = await req.json();

  // Allow-list de campos (zod descarta o resto) — impede mass-assignment:
  // o cliente não pode setar OwnerId/Concessionaria/etc. via PATCH.
  const parsed = leadPatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(`Dados inválidos: ${parsed.error.issues.map(i => i.message).join(', ')}`, 422);
  }
  const updateData = parsed.data;
  if (Object.keys(updateData).length === 0) {
    return jsonError('Nenhum campo válido para atualizar', 422);
  }

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);
    const result = await conn.sobject('Lead').update({
      Id: id,
      ...updateData,
    }) as unknown as { success: boolean; errors: unknown[] };

    if (!result.success) {
      return jsonError(`Salesforce rejeitou: ${JSON.stringify(result.errors)}`, 400);
    }

    return jsonOk({ message: 'Lead atualizado', leadId: id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return jsonError(`Erro ao atualizar Lead: ${msg}`, 500);
  }
}
