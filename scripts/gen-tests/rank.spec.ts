import { describe, expect, it } from 'vitest';
import { parseCoverageSummary, rankLowCoverageFiles } from './rank';

describe('rankLowCoverageFiles', () => {
  it('按距离阈值的缺口乘路径权重排序，并跳过测试文件', () => {
    const summary = parseCoverageSummary(
      {
        total: { lines: { pct: 80 } },
        '/repo/servers/liangzui-ai-server/src/chat/context-window.ts': { lines: { pct: 40 } },
        '/repo/packages/app-core/src/pages/chat-page.tsx': { lines: { pct: 40 } },
        '/repo/servers/liangzui-ai-server/src/chat/context-window.spec.ts': { lines: { pct: 10 } },
      },
      '/repo',
    );
    const ranked = rankLowCoverageFiles(summary);
    expect(ranked.map((item) => item.path)).toEqual([
      'servers/liangzui-ai-server/src/chat/context-window.ts',
      'packages/app-core/src/pages/chat-page.tsx',
    ]);
    expect(ranked[0]?.deficit ?? 0).toBeGreaterThan(ranked[1]?.deficit ?? 0);
  });
});
