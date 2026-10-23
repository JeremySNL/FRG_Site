import { afterEach, describe, expect, it, vi } from 'vitest';

import { verifyTurnstile } from '../src/lib/turnstile.ts';

/**
 * The Turnstile check is the only bot protection the form endpoints have: the
 * honeypot is trivial to skip and the rate limiter lives in a single isolate.
 * These tests pin the contract the endpoints rely on, most importantly that a
 * production build without the secret refuses submissions instead of accepting
 * every one of them.
 *
 * The secret is read from the runtime environment object the endpoint passes
 * in, never from `import.meta.env`: secret schema variables are not inlined by
 * the build, so a built worker would otherwise always see them as unset.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Make the siteverify call answer with a fixed verdict. */
function cloudflareAnswers(success: boolean): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ success }), { status: 200 })),
  );
}

describe('verifyTurnstile', () => {
  it('skips the check while developing without a secret', async () => {
    vi.stubEnv('PROD', false);

    await expect(
      verifyTurnstile('', '203.0.113.7', {}),
    ).resolves.toBe('valid');
  });

  it('refuses the submission in production without a secret', async () => {
    vi.stubEnv('PROD', true);

    await expect(
      verifyTurnstile('', '203.0.113.7', {}),
    ).resolves.toBe('unconfigured');
  });

  it('rejects a missing token when the secret is configured', async () => {
    cloudflareAnswers(true);

    await expect(
      verifyTurnstile(undefined, '203.0.113.7', {
        TURNSTILE_SECRET_KEY: 'a-secret',
      }),
    ).resolves.toBe('invalid');
  });

  it('accepts the token Cloudflare validates', async () => {
    cloudflareAnswers(true);

    await expect(
      verifyTurnstile('a-token', '203.0.113.7', {
        TURNSTILE_SECRET_KEY: 'a-secret',
      }),
    ).resolves.toBe('valid');
  });

  it('sends the token and the secret to the siteverify endpoint', async () => {
    const fetchMock = vi.fn(
      async (_url: unknown, init?: unknown) =>
        new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      verifyTurnstile('a-token', '203.0.113.7', {
        TURNSTILE_SECRET_KEY: 'a-secret',
      }),
    ).resolves.toBe('valid');

    const init = fetchMock.mock.calls[0]?.[1] as { body?: unknown } | undefined;
    const sent = new URLSearchParams(String(init?.body ?? ''));
    expect(sent.get('secret')).toBe('a-secret');
    expect(sent.get('response')).toBe('a-token');
    expect(sent.get('remoteip')).toBe('203.0.113.7');
  });

  it('rejects the token Cloudflare refuses', async () => {
    cloudflareAnswers(false);

    await expect(
      verifyTurnstile('a-token', '203.0.113.7', {
        TURNSTILE_SECRET_KEY: 'a-secret',
      }),
    ).resolves.toBe('invalid');
  });

  it('rejects when Cloudflare cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network is down');
      }),
    );

    await expect(
      verifyTurnstile('a-token', '203.0.113.7', {
        TURNSTILE_SECRET_KEY: 'a-secret',
      }),
    ).resolves.toBe('invalid');
  });
});
