/**
 * Runtime environment of the worker.
 *
 * The schema of `astro.config.ts` marks the server-side variables as secrets
 * (`access: 'secret'`), and secret variables are never inlined by the build:
 * reading them through `import.meta.env` yields `undefined` in any compiled
 * bundle. They exist only in the runtime environment the Cloudflare adapter
 * exposes as `locals.runtime.env`, so form libraries receive it as a plain
 * object instead.
 */
export type RuntimeEnv = Record<string, string | undefined>;
