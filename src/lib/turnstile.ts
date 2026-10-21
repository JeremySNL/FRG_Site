/**
 * Cloudflare Turnstile verification.
 *
 * Turnstile replaces the reCAPTCHA v3 that WPForms used. When no secret key
 * is configured the check is skipped, so local development works out of the
 * box — but the endpoint refuses to be silently open in production.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** True when a Turnstile secret key is configured. */
export function isTurnstileEnabled(): boolean {
  return Boolean(import.meta.env.TURNSTILE_SECRET_KEY);
}

/**
 * Verify a Turnstile token.
 *
 * Returns `true` when the token is valid, or when Turnstile is not
 * configured at all.
 */
export async function verifyTurnstile(
  token: string | undefined,
  remoteIp?: string,
): Promise<boolean> {
  const secret = import.meta.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) return false;

    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
