import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const workspaceRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

export const workspaceAliases = {
  '@ai-engine/app-core': path.join(workspaceRoot, 'packages/app-core/src/index.ts'),
  '@ai-engine/platform': path.join(workspaceRoot, 'packages/platform/src/index.ts'),
  '@ai-engine/contracts': path.join(workspaceRoot, 'packages/contracts/src/index.ts'),
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(fileURLToPath(new URL('.', import.meta.url)), './src'),
      ...workspaceAliases,
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
      },
    },
  },
});
