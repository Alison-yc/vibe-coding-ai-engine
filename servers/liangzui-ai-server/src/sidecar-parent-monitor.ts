import type { AddressInfo } from 'node:net';

export const SIDECAR_READY_PREFIX = '__AI_ENGINE_SIDECAR_READY__';

export const sidecarReadyUrl = (address: AddressInfo | string | null): string => {
  if (!address || typeof address === 'string') {
    throw new Error('无法读取 sidecar 监听端口');
  }
  return `http://127.0.0.1:${address.port}`;
};

export const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
};

export const watchParentProcess = (options: {
  parentPid: number;
  onParentExit: () => void;
  intervalMs?: number;
  isAlive?: (pid: number) => boolean;
}): (() => void) => {
  const isAlive = options.isAlive ?? isProcessAlive;
  const timer = setInterval(() => {
    if (isAlive(options.parentPid)) return;
    clearInterval(timer);
    options.onParentExit();
  }, options.intervalMs ?? 1_000);
  timer.unref();
  return () => clearInterval(timer);
};
