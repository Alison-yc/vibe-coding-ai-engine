import { describe, expect, it } from 'vitest';
import { FakeLlmGateway } from '../llm/fake-llm-gateway';
import { translate } from './translate';

describe('translate', () => {
  it('把系统提示词和用户文本传给模型', async () => {
    const gateway = new FakeLlmGateway();
    gateway.enqueueText('Hello');

    await expect(translate(gateway, '你好')).resolves.toBe('Hello');
    const call = gateway.calls[0];
    expect(call?.method === 'chat' ? call.request.content : '').toContain(
      'Output only the translation',
    );
    expect(call?.method === 'chat' ? call.request.content : '').toContain(
      '<user_text>你好</user_text>',
    );
  });
});
