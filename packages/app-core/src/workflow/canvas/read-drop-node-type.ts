import { NodeTypeSchema, type NodeType } from '@ai-engine/contracts';
import { clearPendingNodeDrag, takePendingNodeDrag } from './dnd-payload';

/** React 与 DOM 的 DragEvent 类型不一致，只依赖 dataTransfer */
export const readDropNodeType = (event: { dataTransfer: DataTransfer | null }): NodeType | null => {
  const fromTransfer =
    event.dataTransfer?.getData('application/ai-engine-node') ||
    event.dataTransfer?.getData('text/plain');
  const parsed = NodeTypeSchema.safeParse(fromTransfer);
  if (parsed.success) {
    clearPendingNodeDrag();
    return parsed.data;
  }
  return takePendingNodeDrag();
};
