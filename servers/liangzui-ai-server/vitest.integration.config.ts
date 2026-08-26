import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [swc.vite()],
  test: {
    name: 'server-integration',
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    env: {
      NODE_ENV: 'test',
      RUN_DB_INTEGRATION: 'true',
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://ai_engine:ai_engine_dev_only@localhost:5432/ai_engine',
    },
  },
});
