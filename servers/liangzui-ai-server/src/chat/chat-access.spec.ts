import { ROLE_PERMISSIONS } from '@ai-engine/contracts';
import { describe, expect, it } from 'vitest';
import { findModelCapability } from '../llm/model-capabilities';
import { resolveChatAccess } from './chat-access';

describe('resolveChatAccess', () => {
  const gemma = findModelCapability('gemma4:e2b');

  it('模型支持工具但访客没有 chat:tools 时工具关闭', () => {
    expect(gemma?.supportsTools).toBe(true);
    expect(resolveChatAccess(gemma, ROLE_PERMISSIONS.guest)).toEqual({
      modelSwitch: true,
      rag: false,
      tools: false,
      fileAccess: false,
    });
  });

  it('登录用户在支持工具的模型上开放全部对话能力', () => {
    expect(resolveChatAccess(gemma, ROLE_PERMISSIONS.user)).toEqual({
      modelSwitch: true,
      rag: true,
      tools: true,
      fileAccess: true,
    });
  });

  it('未测评模型即便用户有权限也不开放工具', () => {
    expect(resolveChatAccess(null, ROLE_PERMISSIONS.admin)).toMatchObject({
      rag: true,
      tools: false,
      fileAccess: false,
    });
  });

  it('只有 chat:file-access 没有 chat:tools 时文件访问也关闭', () => {
    expect(resolveChatAccess(gemma, ['chat:basic', 'chat:file-access']).fileAccess).toBe(false);
  });
});
