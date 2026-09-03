import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'minter/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
