import swc from 'unplugin-swc';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [swc.vite()],
  test: {
    name: 'server',
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
  },
});
