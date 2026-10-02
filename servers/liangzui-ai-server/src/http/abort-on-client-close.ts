import type { Request } from 'express';

export const abortOnClientClose = (request: Request): AbortSignal => {
  const controller = new AbortController();
  request.on('close', () => {
    controller.abort(new Error('client closed'));
  });
  return controller.signal;
};
