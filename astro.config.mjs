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
      dsn: 'https://f17f07051a08ff2ea4df318238c7b370@o4510827630231552.ingest.de.sentry.io/4511076741349456',
      sourceMapsUploadOptions: { enabled: false },
    }),
  ],
});