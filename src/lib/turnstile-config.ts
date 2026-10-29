/**
 * Public Cloudflare Turnstile site key.
 *
 * Astro inlines client environment variables at build time. Production builds
 * may run without the local `.env`, so keep the registered site key as a
 * fallback while allowing an environment-specific override.
 */
const DEFAULT_TURNSTILE_SITE_KEY = '0x4AAAAAAFiF8AQph88l_IIW';

export const turnstileSiteKey =
  import.meta.env.TURNSTILE_SITE_KEY?.trim() || DEFAULT_TURNSTILE_SITE_KEY;
