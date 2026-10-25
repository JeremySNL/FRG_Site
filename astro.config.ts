import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cloudflare from '@astrojs/cloudflare';
import { satteri } from '@astrojs/markdown-satteri';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField } from 'astro/config';
import { createMediaUrlOptions } from './src/lib/media-url.ts';
import { rehypeMediaUrls } from './src/lib/rehype-media.ts';

const src = fileURLToPath(new URL('./src', import.meta.url));
const envFile = fileURLToPath(new URL('./.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const mediaUrlOptions = createMediaUrlOptions(
  process.env['MEDIA_BASE_URL'] ?? process.env['R2_PUBLIC_URL'],
);

export default defineConfig({
  site: 'https://fundacionrosariogaton.org',
  trailingSlash: 'always',

  // Static-first. Every page is prerendered at build time; only the form
  // endpoints opt out (see `src/pages/api/*.ts`).
  output: 'static',

  // The site keeps no server-side state, so sessions are turned off. Without
  // this the Cloudflare adapter provisions a `SESSION` KV binding that the
  // deployment would need.
  session: false,

  markdown: {
    processor: satteri({
      hastPlugins: [rehypeMediaUrls(mediaUrlOptions)],
    }),
  },

  adapter: cloudflare({
    // Images are transformed with Sharp at build time; runtime transforms are
    // left to the Cloudflare Images binding for any on-demand route.
    imageService: 'compile',
    // The site is fully static, so prerendering does not need the workerd
    // runtime. Keeps `astro build` fast and dependency-light.
    prerenderEnvironment: 'node',
  }),

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: { '~': src },
    },
  },

  env: {
    schema: {
      // Public Cloudflare Turnstile site key (rendered into the form markup).
      TURNSTILE_SITE_KEY: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      // Server secrets.
      TURNSTILE_SECRET_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      RESEND_API_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      FORM_NOTIFICATION_EMAIL: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      // Where the migrated media lives. Defaults to the production media host.
      MEDIA_BASE_URL: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      // Public media host used by the static build for migrated R2 objects.
      R2_PUBLIC_URL: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
    },
  },
});
