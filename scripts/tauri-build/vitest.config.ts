import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'tauri-build',
    environment: 'node',
    include: ['**/*.spec.ts'],
  },
});
