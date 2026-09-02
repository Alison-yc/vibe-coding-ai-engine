import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'app-core',
    environment: 'node',
    passWithNoTests: false,
  },
});
