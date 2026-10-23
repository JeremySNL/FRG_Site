/**
 * Ambient declaration for `cloudflare:workers`.
 *
 * The project does not depend on `@cloudflare/workers-types` (only a subset
 * of it is needed, and the Astro adapter ships its own minimal typings), so
 * this keeps `tsc --noEmit` green for the one import the form pipeline uses.
 * `env` is unknown on purpose: every consumer narrows it to what it expects.
 */
declare module 'cloudflare:workers' {
  export const env: unknown;
}
