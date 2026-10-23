/**
 * Shared plumbing for the form endpoints.
 *
 * The three forms of the old site (contact, donation and volunteering) were
 * built with WPForms. They are reproduced here as plain `POST` endpoints:
 *
 *   1. the honeypot field is checked (bots fill it in, humans never do),
 *   2. the client is rate limited,
 *   3. the payload is validated with Zod,
 *   4. the Cloudflare Turnstile token is verified,
 *   5. the team is notified by e-mail.
 *
 * No payment is processed: the donation form only starts a conversation, so
 * the site stays out of PCI scope.
 */
import type { APIRoute } from 'astro';
import type { z } from 'astro/zod';

import { sendNotification, type Notification } from './mail.ts';
import type { RuntimeEnv } from './runtime-env.ts';
import { checkRateLimit } from './rate-limit.ts';
import { verifyTurnstile } from './turnstile.ts';

/** The error kinds a client can react to. */
export type ApiErrorKind = 'invalid' | 'invalid-token' | 'rate-limited' | 'server';

export interface ApiResponse {
  ok: boolean;
  error?: ApiErrorKind;
  message?: string;
  /** Field name → message, for the `invalid` error. */
  fields?: Record<string, string>;
}

/** Build a JSON response. */
export function json(body: ApiResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export interface FormHandlerOptions<T> {
  /** The Zod schema of the payload. */
  schema: z.ZodType<T>;
  /** Form fields that hold several values (the multi-selects). */
  listFields?: string[];
  /** Build the notification e-mail from the validated payload. */
  notification: (payload: T) => Notification;
  /** How many submissions a single client may send per minute. */
  rateLimit?: number;
}

/** Read the client address, whatever the runtime exposes. */
function clientAddressOf(request: Request, fallback?: string): string {
  const header = request.headers.get('cf-connecting-ip');
  if (header) return header;

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';

  return fallback ?? 'unknown';
}

/**
 * Build the `POST` handler of a form endpoint.
 */
export function createFormHandler<T>(options: FormHandlerOptions<T>): APIRoute {
  const listFields = options.listFields ?? [];

  return async ({ request, clientAddress, locals }) => {
    // Secret-schema variables (`TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`,
    // `FORM_NOTIFICATION_EMAIL`) only exist in the runtime environment the
    // adapter exposes; they are never inlined by the build.
    const env: RuntimeEnv =
      (locals as { runtime?: { env?: RuntimeEnv } }).runtime?.env ?? {};
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'server', message: 'Method not allowed' }, 405);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return json({ ok: false, error: 'invalid', message: 'Invalid form data' }, 400);
    }

    // Honeypot: a filled field means a bot. Answer as if it worked, but do
    // nothing else.
    if (String(form.get('website') ?? '') !== '') {
      return json({ ok: true }, 200);
    }

    const address = clientAddressOf(request, clientAddress);

    if (!checkRateLimit(address, options.rateLimit ?? 5)) {
      return json({ ok: false, error: 'rate-limited' }, 429);
    }

    const token = String(
      form.get('turnstileToken') ?? form.get('cf-turnstile-response') ?? '',
    );

    const raw: Record<string, unknown> = {};

    for (const [key, value] of form.entries()) {
      if (key === 'website' || key === 'turnstileToken') continue;
      if (typeof value !== 'string') continue;
      raw[key] = value;
    }

    for (const field of listFields) {
      raw[field] = form.getAll(field).map((value) => String(value));
    }

    const parsed = options.schema.safeParse({ ...raw, turnstileToken: token });

    if (!parsed.success) {
      const fields: Record<string, string> = {};

      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_';
        fields[key] ??= issue.message;
      }

      return json(
        { ok: false, error: 'invalid', message: 'Validation failed', fields },
        400,
      );
    }

    const verdict = await verifyTurnstile(token, address, env);

    // A missing secret is a deployment mistake, not something the visitor did
    // wrong: answer with a server error so the form never runs unprotected.
    if (verdict === 'unconfigured') {
      console.error(
        '[form] TURNSTILE_SECRET_KEY is not set; the submission was refused',
      );
      return json({ ok: false, error: 'server' }, 500);
    }

    if (verdict === 'invalid') {
      return json({ ok: false, error: 'invalid-token' }, 403);
    }

    const delivery = await sendNotification(options.notification(parsed.data), env);

    if (delivery === 'failed') {
      return json({ ok: false, error: 'server' }, 500);
    }

    return json({ ok: true }, 200);
  };
}
