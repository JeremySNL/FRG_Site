/**
 * The donation form endpoint.
 *
 * Reproduces the WPForms form 742 of the old site. **No payment is processed**
 * here: the form records what the visitor wants to donate and notifies the
 * team, who coordinate the donation out of band. That keeps the project out
 * of PCI scope.
 */
import { createFormHandler } from '~/lib/api.ts';
import { donationSchema } from '~/lib/forms.ts';
import { formatBody } from '~/lib/mail.ts';

/** This endpoint runs on the Worker, not at build time. */
export const prerender = false;

export const POST = createFormHandler({
  schema: donationSchema,
  listFields: ['donationTypes'],

  notification: (payload) => ({
    subject: `[Donación] ${payload.name}`,
    body: formatBody([
      ['Nombre y apellidos', payload.name],
      ['Teléfono / WhatsApp', payload.phone],
      ['Correo electrónico', payload.email],
      ['Qué desea donar', payload.donationTypes.join(', ')],
      ['Comentario o mensaje', payload.message],
    ]),
    replyTo: payload.email || undefined,
    tag: 'donation',
  }),
});
