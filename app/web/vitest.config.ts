import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@app\/shared\/ui$/, replacement: fileURLToPath(new URL('../../shared/ui/index.ts', import.meta.url)) },
      { find: /^@app\/shared$/, replacement: fileURLToPath(new URL('../../shared/core/index.ts', import.meta.url)) },
    ],
  },
  test: {
    environment: 'jsdom',
    restoreMocks: true,
  },
});
