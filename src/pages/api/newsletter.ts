/**
 * The newsletter sign-up endpoint used by the footer form.
 */
import { createFormHandler } from '~/lib/api.ts';
import { newsletterSchema } from '~/lib/forms.ts';
import { formatBody } from '~/lib/mail.ts';

/** This endpoint runs on the Worker, not at build time. */
export const prerender = false;

export const POST = createFormHandler({
  schema: newsletterSchema,

  notification: (payload) => ({
    subject: `[Newsletter] ${payload.email}`,
    body: formatBody([['Correo electrónico', payload.email]]),
    replyTo: payload.email,
    tag: 'newsletter',
  }),
});
