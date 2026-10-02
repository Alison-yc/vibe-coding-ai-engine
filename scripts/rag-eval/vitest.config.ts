import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'rag-eval',
    environment: 'node',
    include: ['**/*.spec.ts'],
  },
});
