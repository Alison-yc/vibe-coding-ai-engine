import { type ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiErrorFilter } from './api-error.filter';

const createHost = () => {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
};

describe('ApiErrorFilter', () => {
  const filter = new ApiErrorFilter();

  it('透传已符合契约的错误体', () => {
    const { host, json, status } = createHost();
    filter.catch(
      new HttpException({ code: 'BAD_REQUEST', message: '请求参数不合法' }, HttpStatus.BAD_REQUEST),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ code: 'BAD_REQUEST', message: '请求参数不合法' });
  });

  it('把普通 HttpException 映射为契约错误码', () => {
    const { host, json, status } = createHost();
    filter.catch(new HttpException('gone', HttpStatus.NOT_FOUND), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ code: 'NOT_FOUND', message: 'gone' });
  });

  it.each([
    [HttpStatus.BAD_REQUEST, 'BAD_REQUEST'],
    [HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED'],
    [HttpStatus.CONFLICT, 'CONFLICT'],
    [HttpStatus.PAYLOAD_TOO_LARGE, 'PAYLOAD_TOO_LARGE'],
    [HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED'],
    [HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE'],
    [HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL'],
  ] as const)('把 HTTP %s 映射为 %s', (status, code) => {
    const { host, json } = createHost();
    filter.catch(new HttpException('mapped', status), host);
    expect(json).toHaveBeenCalledWith({ code, message: 'mapped' });
  });

  it('从对象响应中取出 message 字段', () => {
    const { host, json } = createHost();
    filter.catch(
      new HttpException({ message: '对象消息', statusCode: 401 }, HttpStatus.UNAUTHORIZED),
      host,
    );
    expect(json).toHaveBeenCalledWith({ code: 'UNAUTHORIZED', message: '对象消息' });
  });

  it('对象响应没有可用 message 时回退到 exception.message', () => {
    const { host, json } = createHost();
    filter.catch(new HttpException({ statusCode: 409 }, HttpStatus.CONFLICT), host);
    expect(json.mock.calls[0]?.[0]).toMatchObject({ code: 'CONFLICT' });
  });

  it('未知异常返回 INTERNAL', () => {
    const { host, json, status } = createHost();
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ code: 'INTERNAL', message: '服务器内部错误' });
  });
});
