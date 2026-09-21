import { createContext, createElement, type ReactNode, useContext } from 'react';
import type { Platform } from './types';

const PlatformContext = createContext<Platform | null>(null);

export const PlatformProvider = ({ value, children }: { value: Platform; children: ReactNode }) =>
  createElement(PlatformContext.Provider, { value }, children);

export const usePlatform = (): Platform => {
  const platform = useContext(PlatformContext);
  if (!platform) {
    throw new Error('usePlatform 必须在 PlatformProvider 内使用');
  }
  return platform;
};
