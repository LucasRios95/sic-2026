import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  userId?: string;
  tenantId?: string;
  companyId?: string;
  accessibleCompanyIds?: string[];
  permissions?: string[];
  roles?: string[];
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function getCurrentUserId(): string | undefined {
  return storage.getStore()?.userId;
}

export function getCurrentTenantId(): string | undefined {
  return storage.getStore()?.tenantId;
}

export function getCurrentCompanyId(): string | undefined {
  return storage.getStore()?.companyId;
}

/**
 * Atualiza campos do contexto após sua criação inicial (ex.: depois da autenticação,
 * o middleware preenche userId, tenantId, etc.). Falha silenciosa se chamado fora de contexto.
 */
export function updateRequestContext(partial: Partial<RequestContext>): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  Object.assign(ctx, partial);
}
