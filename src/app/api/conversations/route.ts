// ============================================================
// POST /api/conversations — Registrar histórico WhatsApp como Task no Salesforce
//
// Input:
//   { recordId, recordType: 'Lead'|'Opportunity', participantName,
//     conversationDate?, messages: [{ actor, text, time? }] }
//
// Regras:
//   - recordType=Lead  → Task.WhoId = recordId
//   - recordType=Opportunity → Task.WhatId = recordId.
//     Se a Opp tiver ContactId, também usa Task.WhoId = ContactId.
//   - Status sempre 'Completed' (histórico passado)
//   - Type = 'Call' (interação com cliente)
// ============================================================

import { NextRequest } from 'next/server';
import { createConnection, sanitizeSfId } from '@/lib/salesforce';
import { conversationSchema } from '@/lib/schemas';
import { createRouteLogger } from '@/lib/logger';
import {
  handleOptions, extractSfCredentials, extractSfCredentialsFromBody,
  validateApiToken, jsonOk, jsonError,
} from '@/lib/api-middleware';

export async function OPTIONS() {
  return handleOptions();
}

// ─── Helpers ─────────────────────────────────────────────────

/** Formata "YYYY-MM-DD" como "DD/MM/YYYY". */
function formatDateBR(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

/** Monta o bloco de texto que vai no Description da Task. */
function buildDescription(args: {
  conversationDate: string;
  participantName:  string;
  messages: Array<{ actor: 'Vendedor' | 'Cliente'; text: string; time?: string }>;
}): string {
  const header = `=== Conversa WhatsApp - ${formatDateBR(args.conversationDate)} ===`;
  const cliente = `Cliente: ${args.participantName}`;
  const lines = args.messages.map((m) => {
    const time = m.time ? `[${m.time}] ` : '';
    return `${time}${m.actor}: ${m.text}`;
  });
  const footer = '====================================='.padEnd(header.length, '=');
  return [header, cliente, '', ...lines, '', footer].join('\n');
}

// ─── POST ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const log = createRouteLogger('POST /api/conversations');

  if (!validateApiToken(req)) {
    return jsonError('Token inválido', 401);
  }

  const body = await req.json().catch(() => null);
  if (!body) return jsonError('Body inválido', 400);

  const creds = extractSfCredentials(req) || await extractSfCredentialsFromBody(body);
  if (!creds) {
    return jsonError('Credenciais Salesforce ausentes', 401);
  }

  const parsed = conversationSchema.safeParse(body);
  if (!parsed.success) {
    log.warn('Payload inválido', parsed.error.issues);
    return jsonError(`Dados inválidos: ${parsed.error.issues.map(i => i.message).join(', ')}`, 422);
  }

  const data = parsed.data;

  const safeRecordId = sanitizeSfId(data.recordId);
  if (!safeRecordId) {
    return jsonError('recordId inválido', 422);
  }

  const conversationDate = data.conversationDate || new Date().toISOString().split('T')[0];

  try {
    const conn = createConnection(creds.accessToken, creds.instanceUrl);

    // ── Resolve WhoId / WhatId conforme o tipo de registro ────
    let whoId:  string | null = null;
    let whatId: string | null = null;

    if (data.recordType === 'Lead') {
      whoId = safeRecordId;
    } else {
      // Opportunity → WhatId é a própria Opp; busca ContactId pra WhoId se existir
      whatId = safeRecordId;
      try {
        const r = await conn.query<{ ContactId: string | null }>(
          `SELECT ContactId FROM Opportunity WHERE Id = '${safeRecordId}' LIMIT 1`
        );
        const contactId = r.records?.[0]?.ContactId ?? null;
        if (contactId) {
          whoId = contactId;
          log.info('ContactId da Opp resolvido', { oppId: safeRecordId, contactId });
        }
      } catch (e) {
        log.warn('Não foi possível buscar ContactId da Opportunity', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // ── Monta a Task ──────────────────────────────────────────
    const description = buildDescription({
      conversationDate,
      participantName: data.participantName,
      messages:        data.messages,
    });

    const taskRecord: Record<string, string> = {
      Subject:      `WhatsApp - ${data.participantName} - ${formatDateBR(conversationDate)}`,
      Description:  description,
      ActivityDate: conversationDate,
      Status:       'Concluída', // label PT do status na org
      Priority:     'Normal',
    };
    if (whoId)  taskRecord.WhoId  = whoId;
    if (whatId) taskRecord.WhatId = whatId;

    log.info('Criando Task', {
      recordType: data.recordType,
      recordId:   safeRecordId,
      whoId,
      whatId,
      msgCount:   data.messages.length,
    });

    const result = await conn.sobject('Task').create(taskRecord) as unknown as {
      success: boolean;
      id: string;
      errors: unknown[];
    };

    if (!result.success) {
      log.fail('Salesforce rejeitou Task', result.errors);
      return jsonError(`Salesforce rejeitou: ${JSON.stringify(result.errors)}`, 400);
    }

    log.done('Task criada', { taskId: result.id });

    return jsonOk({
      taskId:     result.id,
      recordId:   safeRecordId,
      recordType: data.recordType,
      whoId,
      whatId,
      message:    'Conversa registrada como Task no Salesforce',
    }, 201);

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    log.fail('Erro ao registrar conversa', { error: msg });
    return jsonError(`Erro ao registrar conversa: ${msg}`, 500);
  }
}
