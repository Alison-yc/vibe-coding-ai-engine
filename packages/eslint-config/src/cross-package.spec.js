import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { CROSS_PACKAGE_IMPORT_MESSAGE, createCrossPackageImportGroups } from './cross-package.js';

const lintImport = async (filePath, specifier) => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.{js,ts,tsx}'],
        rules: {
          'no-restricted-imports': ['error', { patterns: createCrossPackageImportGroups() }],
        },
      },
    ],
  });

  const [result] = await eslint.lintText(`import source from '${specifier}';\n`, { filePath });
  return result?.messages ?? [];
};

const expectRestricted = async (filePath, specifier) => {
  const messages = await lintImport(filePath, specifier);
  expect(messages.some((message) => message.message.includes(CROSS_PACKAGE_IMPORT_MESSAGE))).toBe(
    true,
  );
};

const expectAllowed = async (filePath, specifier) => {
  const messages = await lintImport(filePath, specifier);
  expect(messages.some((message) => message.message.includes(CROSS_PACKAGE_IMPORT_MESSAGE))).toBe(
    false,
  );
};

describe('跨包相对路径护栏', () => {
  it('拦住 packages 内兄弟包的相对导入', async () => {
    await expectRestricted('packages/app-core/src/index.ts', '../contracts');
    await expectRestricted('packages/platform/src/index.ts', '../contracts/src');
    await expectRestricted('packages/app-core/src/features/chat.ts', '../../contracts');
  });

  it('拦住从应用目录穿进 packages 的相对导入', async () => {
    await expectRestricted(
      'servers/liangzui-ai-server/src/app.service.ts',
      '../../../packages/contracts',
    );
    await expectRestricted('clients/liangzui-ai-app/src/App.tsx', '../../../packages/platform/src');
  });

  it('允许包名引用和包内相对路径', async () => {
    await expectAllowed('packages/app-core/src/index.ts', '@ai-engine/contracts');
    await expectAllowed('packages/app-core/src/features/chat.ts', '../utils');
    await expectAllowed('packages/app-core/src/index.ts', './local');
  });
});
