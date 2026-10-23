/**
 * Cloudflare Turnstile verification.
 *
 * Turnstile replaces the reCAPTCHA v3 that WPForms used. The widget renders in
 * the form, solves a challenge in the browser and leaves a token in a hidden
 * field; the endpoint then exchanges that token through `siteverify` to get a
 * verdict. The check has to happen on the server: a bot that posts the form
 * directly never renders the widget, so the token is only worth something once
 * Cloudflare confirms it.
 *
 * The secret is read from the runtime environment the endpoint passes in, not
 * from `import.meta.env`: secret schema variables are not inlined by the
 * build, so a built worker would otherwise always see them as unset.
 *
 * When no secret key is configured the check is skipped while developing, so
 * the forms work out of the box. A production deployment is different: without
 * the secret there is nothing to verify against, and the answer says so
 * instead of accepting every submission.
 */
import type { RuntimeEnv } from './runtime-env.ts';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * What the endpoint should do with a submission.
 *
 *  - `valid`        the token was accepted (or the check is disabled in dev).
 *  - `invalid`      the token is missing, rejected, or Cloudflare is down.
 *  - `unconfigured` a production build has no secret, so nothing can be
 *                   verified. This is a deployment mistake, not a bad visitor.
 */
export type TurnstileVerdict = 'valid' | 'invalid' | 'unconfigured';

/**
 * Verify a Turnstile token.
 *
 * `env` is the runtime environment of the request (`locals.runtime.env` on
 * Cloudflare). Without a configured secret the answer depends on the build:
 * development skips the check, production reports `unconfigured` so the
 * endpoint can fail closed.
 */
export async function verifyTurnstile(
  token: string | undefined,
  remoteIp: string | undefined,
  env: RuntimeEnv | undefined,
): Promise<TurnstileVerdict> {
  const secret = env?.TURNSTILE_SECRET_KEY;

  if (!secret) return import.meta.env.PROD ? 'unconfigured' : 'valid';
  if (!token) return 'invalid';

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      console.error(
        '[form] Turnstile siteverify rejected the request:',
        response.status,
      );
      return 'invalid';
    }

    const result = (await response.json()) as {
      success?: boolean;
      'error-codes'?: string[];
    };

    if (result.success !== true) {
      console.error(
        '[form] Turnstile siteverify reported a failed verdict:',
        JSON.stringify(result['error-codes'] ?? []),
      );
      return 'invalid';
    }

    return 'valid';
  } catch {
    return 'invalid';
  }
}
