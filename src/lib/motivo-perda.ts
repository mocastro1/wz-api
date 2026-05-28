// ============================================================
// src/lib/motivo-perda.ts
// Resolve os motivos de perda (Motivo_de_Perda__c) válidos para uma
// origem (LeadSource), respeitando a dependência de picklist do CRM.
//
// FONTE: UI API (/ui-api/object-info/.../picklist-values/{recordTypeId}).
// Ela é a ÚNICA fonte confiável da ordem do bitmask:
//   - describe() e PicklistValueInfo retornam o LeadSource em ordens
//     DIFERENTES da usada pelo validFor → davam o motivo errado.
//   - A UI API entrega `controllerValues` (mapa origem → índice real)
//     e o `validFor` de cada motivo já como array de índices.
// Além disso respeita o Record Type do usuário.
// ============================================================

import type { createConnection } from '@/lib/salesforce';
import { withTimeout, SF_TIMEOUT } from '@/lib/sf-timeout';

type Conn = ReturnType<typeof createConnection>;

interface ObjectInfo {
  defaultRecordTypeId?: string;
  recordTypeInfos?: Record<string, {
    recordTypeId: string;
    defaultRecordTypeMapping: boolean;
    available: boolean;
  }>;
}

interface PicklistValuesResp {
  picklistFieldValues?: Record<string, {
    controllerValues?: Record<string, number>;
    values: Array<{ value: string; label: string; validFor?: number[] }>;
  }>;
}

const MASTER_RECORD_TYPE_ID = '012000000000000AAA';
const FIELD = 'Motivo_de_Perda__c';

/** Descobre o Record Type padrão (ou master) do objeto. */
async function resolveRecordTypeId(conn: Conn, objectName: string): Promise<string> {
  const info = await withTimeout(
    conn.request<ObjectInfo>(`/ui-api/object-info/${objectName}`),
    SF_TIMEOUT.uiapi,
    `object-info ${objectName}`,
  );
  if (info.defaultRecordTypeId) return info.defaultRecordTypeId;
  if (info.recordTypeInfos) {
    const def = Object.values(info.recordTypeInfos).find(
      (rt) => rt.defaultRecordTypeMapping && rt.available
    );
    if (def) return def.recordTypeId;
  }
  return MASTER_RECORD_TYPE_ID;
}

export interface MotivoOption {
  value: string;
  label: string;
}

/** Retorna os motivos de perda válidos para uma origem (LeadSource),
 *  resolvidos pela UI API respeitando a dependência e o Record Type.
 *  Lança erro se a origem não constar no mapa de controllerValues.
 *  Retorna { value, label } — label vem traduzido conforme idioma do user SF. */
export async function getValidMotivosForOrigin(
  conn: Conn,
  objectName: string,
  leadSource: string,
  debug?: (msg: string, data: unknown) => void,
): Promise<MotivoOption[]> {
  const recordTypeId = await resolveRecordTypeId(conn, objectName);

  const resp = await withTimeout(
    conn.request<PicklistValuesResp>(
      `/ui-api/object-info/${objectName}/picklist-values/${recordTypeId}`
    ),
    SF_TIMEOUT.uiapi,
    `picklist-values ${objectName}`,
  );

  const field = resp.picklistFieldValues?.[FIELD];
  if (!field) {
    throw new Error(`Campo ${FIELD} não retornado pela UI API de ${objectName} (RT ${recordTypeId})`);
  }

  const controllerValues = field.controllerValues || {};
  const originIndex = controllerValues[leadSource];

  debug?.('UI API picklist dependente', {
    objectName,
    recordTypeId,
    leadSource,
    originIndex,
    totalMotivos: field.values.length,
  });

  if (originIndex === undefined) {
    throw new Error(
      `Origem "${leadSource}" não encontrada nos controllerValues de ${objectName}.${FIELD}`
    );
  }

  const valid: MotivoOption[] = field.values
    .filter((v) => Array.isArray(v.validFor) && v.validFor.includes(originIndex))
    .map((v) => ({ value: v.value, label: v.label || v.value }));

  debug?.('UI API motivos válidos', { count: valid.length, values: valid.map(v => v.value) });

  return valid;
}
