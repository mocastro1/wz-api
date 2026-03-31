// ============================================================
// src/lib/salesforce.ts — Salesforce client via jsforce
// Cria conexões autenticadas a partir do access token do usuário
// ============================================================

import jsforce, { Connection } from 'jsforce';

const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://test.salesforce.com';
const SF_API_VERSION = process.env.SF_API_VERSION || 'v59.0';

/**
 * Converte uma Lightning URL para a URL de API (My Domain).
 * Ex: https://org.lightning.force.com → https://org.my.salesforce.com
 */
function normalizeInstanceUrl(url: string): string {
  // Remove trailing slash
  url = url.replace(/\/$/, '');
  // Converte lightning.force.com → my.salesforce.com
  // Exemplos:
  //   cometa--crm.sandbox.lightning.force.com → cometa--crm.sandbox.my.salesforce.com
  //   cometa.lightning.force.com → cometa.my.salesforce.com
  if (url.includes('.lightning.force.com')) {
    return url.replace('.lightning.force.com', '.my.salesforce.com');
  }
  return url;
}

/**
 * Cria uma conexão jsforce autenticada usando token do usuário.
 * O token vem da extensão Chrome (OAuth User-Agent Flow).
 */
export function createConnection(accessToken: string, instanceUrl: string) {
  return new jsforce.Connection({
    instanceUrl: normalizeInstanceUrl(instanceUrl),
    accessToken,
    version: SF_API_VERSION.replace('v', ''),
    loginUrl: SF_LOGIN_URL,
  });
}

/**
 * Valida se a conexão está ativa testando a identidade do usuário.
 */
export async function validateConnection(conn: Connection) {
  const identity = await conn.identity();
  return {
    userId: identity.user_id,
    orgId: identity.organization_id,
    userName: identity.display_name || identity.username,
    instanceUrl: conn.instanceUrl,
  };
}

// ─── Normalização de telefone (padrão BR) ─────────────────────
// WhatsApp: 556592988342 (12 dígitos, sem o "9" extra)
// BR real:  5565992988342 (13 dígitos, com o "9")
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');

  // Se já tem 13 dígitos (55 + 2 DDD + 9 + 8 número), está ok
  if (digits.length === 13 && digits.startsWith('55')) return digits;

  // Se tem 12 dígitos (55 + 2 DDD + 8 número), insere o "9"
  if (digits.length === 12 && digits.startsWith('55')) {
    const country = digits.slice(0, 2);
    const ddd = digits.slice(2, 4);
    const number = digits.slice(4);
    return `${country}${ddd}9${number}`;
  }

  // Se tem 11 dígitos (DDD + 9 + 8), adiciona 55
  if (digits.length === 11) return `55${digits}`;

  // Se tem 10 dígitos (DDD + 8), adiciona 55 + 9
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const number = digits.slice(2);
    return `55${ddd}9${number}`;
  }

  return digits;
}

/**
 * Sanitiza um Salesforce ID (18 chars alfanumérico).
 * Previne SOQL injection caso o ID seja manipulado.
 */
export function sanitizeSfId(id: unknown): string {
  if (typeof id !== 'string') return '';
  // IDs do Salesforce são exatamente 15 ou 18 chars alfanuméricos
  const clean = id.replace(/[^A-Za-z0-9]/g, '');
  if (clean.length !== 15 && clean.length !== 18) return '';
  return clean;
}

/**
 * Sanitiza uma string para uso em SOQL (escapa aspas simples).
 */
export function sanitizeSoqlString(value: string): string {
  return value.replace(/'/g, "\\'");
}

/**
 * Extrai os últimos N dígitos para busca LIKE no Salesforce.
 */
export function phoneSearchPattern(phone: string, lastDigits = 11): string {
  const normalized = normalizePhone(phone);
  return normalized.slice(-lastDigits);
}
