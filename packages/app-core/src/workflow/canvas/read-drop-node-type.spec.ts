import { describe, expect, it } from 'vitest';
import { clearPendingNodeDrag, setPendingNodeDrag } from './dnd-payload';
import { readDropNodeType } from './read-drop-node-type';

describe('readDropNodeType', () => {
  it('优先读 dataTransfer，否则回退 pending', () => {
    const withData = {
      dataTransfer: {
        getData: (type: string) =>
          type === 'text/plain' ? 'llm' : type === 'application/ai-engine-node' ? 'llm' : '',
      },
    };
    expect(readDropNodeType(withData)).toBe('llm');

    clearPendingNodeDrag();
    setPendingNodeDrag('code');
    const empty = {
      dataTransfer: { getData: () => '' },
    };
    expect(readDropNodeType(empty)).toBe('code');
  });
});
