import type { NodeType } from '@ai-engine/contracts';

/** HTML5 DnD 在部分浏览器 drop 时 getData 为空；dragStart 写入此处作回退 */
let pendingNodeType: NodeType | null = null;

export const setPendingNodeDrag = (type: NodeType): void => {
  pendingNodeType = type;
};

export const takePendingNodeDrag = (): NodeType | null => {
  const type = pendingNodeType;
  pendingNodeType = null;
  return type;
};

export const clearPendingNodeDrag = (): void => {
  pendingNodeType = null;
};
