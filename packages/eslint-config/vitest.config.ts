import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'eslint-config',
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
});
