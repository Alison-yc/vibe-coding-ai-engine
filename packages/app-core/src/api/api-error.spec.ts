import { describe, expect, it } from 'vitest';
import { localizeApiError } from '../i18n/localize-api-error';
import { ApiRequestError, createApiRequestError } from './api-error';

describe('API 请求错误', () => {
  it('保留合法 ApiError code 并可进入本地化映射', () => {
    const error = createApiRequestError(
      { code: 'SERVICE_UNAVAILABLE', message: '服务暂不可用', requestId: 'req-1' },
      503,
    );

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(localizeApiError(error, (key) => `translated:${key}`)).toBe(
      'translated:api.SERVICE_UNAVAILABLE',
    );
  });

  it('没有合法 code 时保留服务端原始 message', () => {
    const error = createApiRequestError({ message: 'upstream unavailable' }, 502);
    expect(error).not.toBeInstanceOf(ApiRequestError);
    expect(error.message).toBe('upstream unavailable');
  });

  it('错误体没有 message 时只回退到中立 HTTP 状态', () => {
    expect(createApiRequestError({}, 500).message).toBe('HTTP 500');
  });
});
