/**
 * The contact form endpoint.
 *
 * Reproduces the WPForms form 292 of the old site: name, phone, e-mail and a
 * free-text message.
 */
import { createFormHandler } from '~/lib/api.ts';
import { contactSchema } from '~/lib/forms.ts';
import { formatBody } from '~/lib/mail.ts';

/** This endpoint runs on the Worker, not at build time. */
export const prerender = false;

export const POST = createFormHandler({
  schema: contactSchema,

  notification: (payload) => ({
    subject: `[Contacto] ${payload.name}`,
    body: formatBody([
      ['Nombre', payload.name],
      ['Teléfono / WhatsApp', payload.phone],
      ['Correo electrónico', payload.email],
      ['Mensaje', payload.message],
    ]),
    replyTo: payload.email || undefined,
    tag: 'contact',
  }),
});
