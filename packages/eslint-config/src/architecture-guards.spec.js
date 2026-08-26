import { ESLint } from 'eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

// lintText 的 filePath 必须是 tsconfig 里已存在的文件，否则 type-aware parser 会 fatal，护栏规则跑不到。
const APP_CORE = path.join(repoRoot, 'packages/app-core/src/index.ts');
const UI = path.join(repoRoot, 'packages/ui/src/index.ts');
const CONTRACTS = path.join(repoRoot, 'packages/contracts/src/index.ts');

const lintSnippet = async (filePath, source) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const [result] = await eslint.lintText(source, { filePath });
  return result?.messages ?? [];
};

const hasMessage = (messages, fragment) =>
  messages.some((message) => (message.message ?? '').includes(fragment));

describe('根 eslint.config 架构护栏实测', () => {
  it('app-core 不能引用 @tauri-apps 或探测 Tauri', async () => {
    const imports = await lintSnippet(APP_CORE, "import { invoke } from '@tauri-apps/api';\n");
    expect(hasMessage(imports, 'app-core 必须端无关')).toBe(true);

    const globals = await lintSnippet(
      APP_CORE,
      'export const read = () => localStorage.getItem("k");\n',
    );
    expect(hasMessage(globals, '走 @ai-engine/platform 的 kv 接口')).toBe(true);
  });

  it('ui 不能依赖 app-core / contracts / platform', async () => {
    const messages = await lintSnippet(UI, "import { App } from '@ai-engine/app-core';\n");
    expect(hasMessage(messages, 'ui 包只做无状态展示')).toBe(true);
  });

  it('contracts 不能依赖 react 或其他 @ai-engine 包', async () => {
    const messages = await lintSnippet(CONTRACTS, "import { useState } from 'react';\n");
    expect(hasMessage(messages, 'contracts 是纯类型契约层')).toBe(true);
  });
});
