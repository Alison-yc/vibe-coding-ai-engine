import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'gen-tests',
    environment: 'node',
    include: ['**/*.spec.ts'],
    exclude: ['.tmp/**', 'packs/**', 'fixtures/**'],
    fileParallelism: false,
    testTimeout: 180_000,
  },
});
