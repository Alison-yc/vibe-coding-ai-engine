export const UI_POINTER_TRAIL_STORAGE_KEY = 'ui.pointerTrail';

/** 设置页写入 KV 后派发，供壳层拖尾 overlay 同 Tab 内刷新偏好。 */
export const UI_POINTER_TRAIL_CHANGED_EVENT = 'ai-engine:ui-pointer-trail-changed';

/** 未写入 KV 时默认开启拖尾（用户可在设置中关闭）。 */
export const parsePointerTrailPreference = (raw: string | null): boolean => raw !== 'false';
