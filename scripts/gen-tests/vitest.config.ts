import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'gen-tests',
    environment: 'node',
    include: ['**/*.spec.ts'],
    exclude: ['.tmp/**', 'packs/**', 'fixtures/weak-always-pass.spec.ts'],
    testTimeout: 60_000,
  },
});
