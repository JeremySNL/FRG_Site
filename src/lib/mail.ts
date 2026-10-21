/**
 * Form notification delivery.
 *
 * The site deliberately does **not** process online payments: the donation
 * form is a lead-capture form that notifies the team, who then coordinate the
 * donation out of band. That keeps the project out of PCI scope.
 *
 * Notifications are sent through the Resend HTTP API so no extra dependency
 * is needed. When no API key is configured the mail is only logged, which
 * keeps local development usable.
 */
import { site } from './site.ts';

export interface Notification {
  /** Subject line of the notification. */
  subject: string;
  /** Plain-text body. */
  body: string;
  /** Reply-to address. */
  replyTo?: string;
  /** A short machine-readable tag, used for the Resend metadata. */
  tag: string;
}

export type SendResult = 'sent' | 'skipped' | 'failed';

/** Send a notification e-mail. */
export async function sendNotification(
  notification: Notification,
): Promise<SendResult> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  const to = import.meta.env.FORM_NOTIFICATION_EMAIL ?? site.email;

  if (!apiKey) {
    // Without a key the mail cannot be sent. The message goes to the log so
    // a local run still shows what would have been delivered.
    console.warn(
      `[form] ${notification.subject}\n${notification.body}\n(no RESEND_API_KEY, the mail was not sent)`,
    );
    return 'skipped';
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: `FRG <form@${new URL(site.url).host}>`,
        to: [to],
        subject: notification.subject,
        text: notification.body,
        reply_to: notification.replyTo,
        tags: [{ name: 'form', value: notification.tag }],
      }),
    });

    return response.ok ? 'sent' : 'failed';
  } catch (error) {
    console.error('[form] could not send the notification', error);
    return 'failed';
  }
}

/** Build a plain-text body from a list of labelled values. */
export function formatBody(fields: Array<[string, string | undefined]>): string {
  return fields
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}
