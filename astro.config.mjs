// @ts-check
import { defineConfig } from 'astro/config';
import sentry from '@sentry/astro';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

// REPLACE_ME: Update site URL to your portal domain
export default defineConfig({
  site: 'https://plainlayoffs.com',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  build: { inlineStylesheets: 'auto' },
  vite: {
    plugins: [tailwindcss()],
    build: { target: 'es2022' },
  },
  integrations: [
    sentry({
      dsn: 'REPLACE_ME_SENTRY_DSN',
      sourceMapsUploadOptions: { enabled: false },
    }),
  ],
});