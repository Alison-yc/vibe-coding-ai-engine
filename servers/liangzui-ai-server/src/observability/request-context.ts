import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  traceId: string;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(context: RequestContext, run: () => T): T =>
  requestContextStorage.run(context, run);

export const getRequestContext = (): RequestContext | undefined => requestContextStorage.getStore();

export const getTraceId = (): string | undefined => getRequestContext()?.traceId;

const readBoundTraceId = (request: unknown): string | undefined => {
  if (typeof request !== 'object' || request === null || !('traceId' in request)) {
    return undefined;
  }
  const value = request.traceId;
  return typeof value === 'string' ? value : undefined;
};

export const bindTraceId = (request: object, traceId: string): void => {
  Object.assign(request, { traceId });
};

export const traceIdLogProps = (request?: object): { traceId?: string } => {
  const traceId = readBoundTraceId(request) ?? getTraceId();
  return traceId ? { traceId } : {};
};
