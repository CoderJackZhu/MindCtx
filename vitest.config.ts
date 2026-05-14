import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@minddoc/core': resolve(__dirname, 'packages/core/src/index.ts'),
    },
  },
});
