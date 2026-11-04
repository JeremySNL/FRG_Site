import type { APIContext } from 'astro';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The form endpoints are the only code that runs on the server, and every one
 * of them is built by `createFormHandler`. These tests drive the real `POST`
 * handlers of the contact and donation endpoints, the way a browser does, and
 * pin each step of the pipeline: honeypot, rate limit, validation, Turnstile
 * and the notification e-mail.
 *
 * The runtime environment comes from `cloudflare:workers`, which only exists
 * inside the Worker, so it is replaced by a plain object here. Turnstile and
 * Resend are reached through `fetch`, which is stubbed per test.
 */
const runtime = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));

vi.mock('cloudflare:workers', () => runtime);

const { POST: contactPost } = await import('../src/pages/api/contact.ts');
const { POST: donationPost } = await import('../src/pages/api/donar.ts');

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RESEND = 'https://api.resend.com/emails';

interface Call {
  url: string;
  body: string;
}

let calls: Call[] = [];

/** Answer Turnstile with `success` and Resend with `mailStatus`. */
function stubNetwork({ success = true, mailStatus = 200 } = {}): void {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: String(init?.body ?? '') });

      if (url === SITEVERIFY) {
        return new Response(JSON.stringify({ success }), { status: 200 });
      }
      if (url === RESEND) {
        return new Response('{}', { status: mailStatus });
      }
      throw new Error(`Unexpected request to ${url}`);
    }),
  );
}

let ipCounter = 0;

/** A fresh client address, so the in-memory rate limiter never leaks between tests. */
function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

/** Submit a form to an endpoint the way the browser does. */
async function submit(
  handler: typeof contactPost,
  fields: Array<[string, string]>,
  ip = nextIp(),
): Promise<{ status: number; body: Record<string, unknown> }> {
  const form = new FormData();
  for (const [key, value] of fields) form.append(key, value);

  const request = new Request('https://fundacionrosariogaton.org/api/contact/', {
    method: 'POST',
    body: form,
    headers: { 'cf-connecting-ip': ip },
  });

  const response = await handler({
    request,
    clientAddress: ip,
  } as unknown as APIContext);
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

const validContact: Array<[string, string]> = [
  ['name', 'Ana Pérez'],
  ['phone', '809-555-0100'],
  ['email', 'ana@example.org'],
  ['message', 'Quiero colaborar.'],
  ['turnstileToken', 'token-ok'],
];

const sentTo = (url: string): Call[] => calls.filter((call) => call.url === url);

beforeEach(() => {
  runtime.env = {
    TURNSTILE_SECRET_KEY: 'secret',
    RESEND_API_KEY: 'resend-key',
    FORM_NOTIFICATION_EMAIL: 'equipo@example.org',
  };
  stubNetwork();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('form endpoints', () => {
  it('answers a filled honeypot as a success and sends nothing', async () => {
    const result = await submit(contactPost, [...validContact, ['website', 'spam']]);

    expect(result).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([]);
  });

  it('rejects the sixth submission of a client within a minute', async () => {
    const ip = nextIp();
    const empty: Array<[string, string]> = [['name', '']];

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await submit(contactPost, empty, ip)).status).toBe(400);
    }

    expect(await submit(contactPost, empty, ip)).toEqual({
      status: 429,
      body: { ok: false, error: 'rate-limited' },
    });
  });

  it('reports the invalid fields without calling Turnstile or Resend', async () => {
    const result = await submit(contactPost, [
      ['name', 'A'],
      ['phone', '809-555-0100'],
      ['email', 'not-an-email'],
    ]);

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      ok: false,
      error: 'invalid',
      fields: { name: 'too-short', email: 'invalid-email' },
    });
    expect(calls).toEqual([]);
  });

  it('refuses a token that Turnstile rejects and sends no e-mail', async () => {
    stubNetwork({ success: false });

    const result = await submit(contactPost, validContact);

    expect(result).toEqual({
      status: 403,
      body: { ok: false, error: 'invalid-token' },
    });
    expect(sentTo(RESEND)).toEqual([]);
  });

  it('refuses every submission in production when the Turnstile secret is missing', async () => {
    vi.stubEnv('PROD', true);
    runtime.env = { RESEND_API_KEY: 'resend-key' };

    const result = await submit(contactPost, validContact);

    expect(result).toEqual({ status: 500, body: { ok: false, error: 'server' } });
    expect(calls).toEqual([]);
  });

  it('reports a server error when Resend refuses the notification', async () => {
    stubNetwork({ mailStatus: 500 });

    const result = await submit(contactPost, validContact);

    expect(result).toEqual({ status: 500, body: { ok: false, error: 'server' } });
  });

  it('verifies the token and e-mails the team on a valid submission', async () => {
    const ip = nextIp();

    const result = await submit(contactPost, validContact, ip);

    expect(result).toEqual({ status: 200, body: { ok: true } });

    const [verification] = sentTo(SITEVERIFY);
    const verified = new URLSearchParams(verification?.body);
    expect(verified.get('response')).toBe('token-ok');
    expect(verified.get('remoteip')).toBe(ip);

    const [mail] = sentTo(RESEND);
    expect(JSON.parse(mail?.body ?? '{}')).toMatchObject({
      to: ['equipo@example.org'],
      subject: '[Contacto] Ana Pérez',
      reply_to: 'ana@example.org',
      text: [
        'Nombre: Ana Pérez',
        'Teléfono / WhatsApp: 809-555-0100',
        'Correo electrónico: ana@example.org',
        'Mensaje: Quiero colaborar.',
      ].join('\n'),
    });
  });

  it('joins every selected option of a multi-select into the e-mail', async () => {
    const result = await submit(donationPost, [
      ['name', 'Luis Gómez'],
      ['phone', '809-555-0101'],
      ['donationTypes', 'Ropa y calzado'],
      ['donationTypes', 'Libros y material educativo'],
      ['turnstileToken', 'token-ok'],
    ]);

    expect(result.status).toBe(200);

    const [mail] = sentTo(RESEND);
    expect(JSON.parse(mail?.body ?? '{}').text).toContain(
      'Qué desea donar: Ropa y calzado, Libros y material educativo',
    );
  });
});
