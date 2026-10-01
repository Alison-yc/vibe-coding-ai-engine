import { useSearchParams } from 'react-router';
import { safeRedirect } from './safe-redirect';

export const AUTH_LINK_CLASS_NAME = 'text-primary underline-offset-4 hover:underline';

/** 在登录、注册、重置页之间跳转时保留经过校验的 redirect。 */
export const useRedirectQuery = () => {
  const [params] = useSearchParams();
  const raw = params.get('redirect');
  const redirect = safeRedirect(raw);
  return { redirect, query: raw ? `?redirect=${encodeURIComponent(redirect)}` : '' };
};
