/**
 * The volunteering form endpoint.
 *
 * Reproduces the WPForms form 768 of the old site.
 */
import { createFormHandler } from '~/lib/api.ts';
import { volunteerSchema } from '~/lib/forms.ts';
import { formatBody } from '~/lib/mail.ts';

/** This endpoint runs on the Worker, not at build time. */
export const prerender = false;

export const POST = createFormHandler({
  schema: volunteerSchema,
  listFields: ['collaborationTypes'],

  notification: (payload) => ({
    subject: `[Voluntariado] ${payload.name}`,
    body: formatBody([
      ['Nombre y apellidos', payload.name],
      ['Teléfono / WhatsApp', payload.phone],
      ['Correo electrónico', payload.email],
      ['En qué desea colaborar', payload.collaborationTypes.join(', ')],
      ['Comentario o mensaje', payload.message],
    ]),
    replyTo: payload.email || undefined,
    tag: 'volunteering',
  }),
});
