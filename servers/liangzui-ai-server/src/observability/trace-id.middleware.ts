import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { bindTraceId, getRequestContext, runWithRequestContext } from './request-context';

const TRACE_HEADER = 'x-trace-id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.header(TRACE_HEADER);
    const traceId = incoming && UUID_PATTERN.test(incoming) ? incoming : randomUUID();
    bindTraceId(request, traceId);
    response.setHeader(TRACE_HEADER, traceId);
    runWithRequestContext({ traceId }, () => next());
  }
}

export const readTraceIdFromRequest = (request: Request): string | undefined => {
  const fromContext = getRequestContext()?.traceId;
  if (fromContext) return fromContext;
  const incoming = request.header(TRACE_HEADER);
  return incoming && UUID_PATTERN.test(incoming) ? incoming : undefined;
};
