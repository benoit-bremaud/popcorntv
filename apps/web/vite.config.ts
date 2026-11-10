import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Bundle the shared sources directly: no `pnpm build` of packages/shared needed.
    alias: {
      '@popcorntv/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  build: {
    // The static 404 page Caddy answers for unknown paths (#177) is a second entry, so it
    // shares the hashed token stylesheet pipeline.
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        notFound: fileURLToPath(new URL('404.html', import.meta.url)),
      },
    },
  },
  server: {
    proxy: {
      // The web player calls the API under /api; the dev server forwards to Fastify
      // at API_URL (shell variable, like the server's own settings).
      '/api': {
        target: process.env['API_URL'] || 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // Vitest blanks CSS by default; tokens.css (contrast, #167) and not-found.css (404 motion
    // guard, #264) must stay readable for their tests.
    css: { include: [/\/styles\/(tokens|not-found)\.css(\?|$)/] },
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      // Entry point and test setup: exercised by the e2e smoke and the QA pass.
      exclude: ['src/main.tsx', 'src/test-setup.ts', 'src/**/*.test.{ts,tsx}'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
