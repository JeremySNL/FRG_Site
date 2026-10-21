/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

/**
 * Environment variables available to the site.
 *
 * The public ones are declared in `astro.config.ts` under `env.schema`; the
 * secret ones are only readable from server routes. `import.meta.env` is
 * typed here so no component has to cast.
 */
interface ImportMetaEnv {
  /** Public Cloudflare Turnstile site key. */
  readonly TURNSTILE_SITE_KEY?: string;
  /** Cloudflare Turnstile secret key. */
  readonly TURNSTILE_SECRET_KEY?: string;
  /** Resend API key used to deliver form notifications. */
  readonly RESEND_API_KEY?: string;
  /** Address that receives the form notifications. */
  readonly FORM_NOTIFICATION_EMAIL?: string;
  /** Base URL of the migrated media (R2 bucket or the legacy uploads host). */
  readonly MEDIA_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
