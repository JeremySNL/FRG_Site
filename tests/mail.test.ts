import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendNotification } from '../src/lib/mail.ts';

/**
 * The Resend key is a secret-schema variable: the build never inlines it, so
 * `sendNotification` reads it from the runtime environment object the endpoint
 * passes in. These tests pin that the delivery path actually uses the runtime
 * environment (a deployed worker without this would silently skip every mail).
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const notification = {
  subject: 'New contact form submission',
  body: 'Name: Ada\nMessage: hello',
  replyTo: 'ada@example.com',
  tag: 'contact',
};

describe('sendNotification', () => {
  it('skips the mail when the runtime environment has no API key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(sendNotification(notification, {})).resolves.toBe('skipped');

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('delivers the mail through Resend when the key is configured', async () => {
    const fetchMock = vi.fn(
      async (_url: unknown, _init?: unknown) =>
        new Response(JSON.stringify({ id: 'm1' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendNotification(notification, {
        RESEND_API_KEY: 're-key',
        FORM_NOTIFICATION_EMAIL: 'team@fundacionrosariogaton.org',
      }),
    ).resolves.toBe('sent');

    const request = fetchMock.mock.calls[0]?.[1] as
      { headers?: { authorization?: string }; body?: string } | undefined;
    expect(request?.headers?.authorization).toBe('Bearer re-key');

    const body = JSON.parse(String(request?.body)) as {
      to: string[];
      reply_to?: string;
    };
    expect(body.to).toEqual(['team@fundacionrosariogaton.org']);
    expect(body.reply_to).toBe('ada@example.com');
  });
});
