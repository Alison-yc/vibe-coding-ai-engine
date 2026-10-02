export const DEFAULT_AFTER_LOGIN_PATH = '/chat';

const AUTH_PAGE_PREFIXES = ['/login', '/register', '/reset-password'];

const hasControlChar = (value: string): boolean =>
  [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });

/**
 * 只接受站内绝对路径。`//host`、`/\host` 会被浏览器当成协议相对地址跳出站点；
 * 控制字符会被 URL 解析器剔除后拼出同样的效果，因此一并拒绝。
 */
export const safeRedirect = (raw: string | null | undefined): string => {
  if (!raw || !raw.startsWith('/')) return DEFAULT_AFTER_LOGIN_PATH;
  if (raw.startsWith('//') || raw.startsWith('/\\') || hasControlChar(raw)) {
    return DEFAULT_AFTER_LOGIN_PATH;
  }
  const pathname = raw.split(/[?#]/, 1)[0] ?? '';
  if (
    AUTH_PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    return DEFAULT_AFTER_LOGIN_PATH;
  }
  return raw;
};
