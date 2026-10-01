/** 并发注册没有可唯一约束的列，用固定顾问锁把「谁是首个管理员」串行化。 */
export const FIRST_ADMIN_LOCK_KEY = 210017;

export const VERIFICATION_TTL_MS = 5 * 60 * 1000;
export const VERIFICATION_EXPIRES_IN_SEC = 5 * 60;
export const VERIFICATION_RESEND_SEC = 60;
export const VERIFICATION_RESEND_MS = 60 * 1000;
export const VERIFICATION_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const VERIFICATION_DAILY_LIMIT = 10;
export const VERIFICATION_MAX_ATTEMPTS = 5;

export const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_LIMIT = 5;

/** 滑动续期时避免每个请求都写库。 */
export const SESSION_TOUCH_MS = 5 * 60 * 1000;

export const USER_AGENT_MAX = 256;
