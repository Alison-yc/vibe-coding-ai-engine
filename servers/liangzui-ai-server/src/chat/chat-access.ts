import type { ModelCapability, Permission } from '@ai-engine/contracts';

export type ChatActor = {
  ownerId: string;
  permissions: readonly Permission[];
};

export type ChatAccess = {
  modelSwitch: boolean;
  rag: boolean;
  tools: boolean;
  fileAccess: boolean;
};

/**
 * 一轮对话最终可用的能力 = 模型能力（ADR-015）∩ 当前用户权限。
 * 访客切到支持工具的模型时，模型侧为真但没有 chat:tools，工具仍然关闭。
 */
export const resolveChatAccess = (
  capability: ModelCapability | null,
  permissions: readonly Permission[],
): ChatAccess => {
  const granted = new Set(permissions);
  const modelTools = capability?.supportsTools === true && capability.maxToolCount > 0;
  const tools = modelTools && granted.has('chat:tools');
  return {
    modelSwitch: granted.has('chat:model-switch'),
    rag: granted.has('chat:rag'),
    tools,
    fileAccess: tools && granted.has('chat:file-access'),
  };
};

export const hasChatPermission = (actor: ChatActor, permission: Permission): boolean =>
  actor.permissions.includes(permission);
