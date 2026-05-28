// ============================================================
// src/lib/sf-timeout.ts
// Wrappa chamadas ao Salesforce com timeout explícito.
// Evita requisições penduradas quando o SF está lento ou indisponível.
// Lança SfTimeoutError para a rota detectar e retornar 504 (não 500).
// ============================================================

export class SfTimeoutError extends Error {
  public readonly op: string;
  public readonly ms: number;
  constructor(op: string, ms: number) {
    super(`Salesforce timeout em "${op}" após ${ms}ms`);
    this.name = 'SfTimeoutError';
    this.op = op;
    this.ms = ms;
  }
}

/** Timeouts padrão por operação (ms) */
export const SF_TIMEOUT = {
  query:   15_000, // SOQL query
  describe: 20_000, // describe é mais pesado
  update:  20_000, // create/update
  uiapi:   15_000, // /ui-api/* (picklist-values, object-info)
} as const;

/**
 * Aceita Promise OU thenable (jsforce.Query é thenable mas não Promise nativa).
 * Promise.resolve() converte para Promise real.
 */
export function withTimeout<T>(thenable: PromiseLike<T>, ms: number, op: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new SfTimeoutError(op, ms)), ms);
  });
  return Promise.race([Promise.resolve(thenable), timeoutPromise]).finally(() => clearTimeout(timer));
}

/** Verifica se um erro veio do timeout (para a rota decidir o status code). */
export function isSfTimeout(err: unknown): err is SfTimeoutError {
  return err instanceof SfTimeoutError;
}
