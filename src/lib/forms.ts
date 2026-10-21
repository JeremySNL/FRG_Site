/**
 * The three lead-capture forms of the site.
 *
 * The field definitions were recovered from the WordPress database: the
 * WPForms markup lives in `wp_posts.post_content` of the pages 113 (contact),
 * 687 (donation) and 796 (volunteering), because those pages were built with
 * the classic editor and the form was embedded with a shortcode.
 *
 * The donation and volunteering forms use a *multiple* select — the same
 * options are reproduced here.
 */
import { z } from 'astro/zod';

export type FormKind = 'contact' | 'donar' | 'voluntariado' | 'newsletter';

/** Options of the "¿Qué desea donar?" select (WPForms form 742). */
export const donationOptions = [
  'Alimentos no perecederos',
  'Medicamentos y productos de higiene',
  'Ropa y calzado',
  'Utiles escolares y mochilas',
  'Mobiliario (camas, colchones, sillas, escritorios)',
  'Materiales de construcción',
  'Herramientas de trabajo comunitario',
  'Equipos electrónicos o tecnológicos funcionales',
  'Dinero en (en efectivo o transferencia)',
  'Donación de insumos o equipos empresariales',
  'Patrocinios o alianzas institucionales',
  'Apoyo logístico o de transporte',
  'Espacios físicos para actividades o talleres',
  'Equipamiento deportivo o cultural',
  'Libros y material educativo',
  'Kits de higiene personal o comunitarios',
  'Alimentos frescos (con previa coordinación)',
  'Artículos para bebés o personas mayores',
  'Otro (consultar con la Fundación)',
] as const;

/** Options of the "¿En qué desea participar o colaborar?" select (form 768). */
export const volunteerOptions = [
  'Colaborar como aliado institucional o empresa solidaria',
  'Ser voluntario en jornadas, eventos y actividades',
  'Servicios profesionales (médicos, legales, educativos, técnicos, etc.)',
  'Facilitar talleres o capacitaciones comunitarias',
  'Brindar apoyo administrativo o logístico',
  'Ser embajador o promotor de la fundación',
  'Participar en campañas de recaudación',
  'Acompañar procesos de formación o mentoría a emprendedores',
  'Otro (consultar con la Fundación)',
] as const;

const name = z.string().trim().min(2, 'too-short').max(120, 'too-long');
const phone = z.string().trim().min(6, 'too-short').max(40, 'too-long');
const email = z
  .union([z.email('invalid-email'), z.literal('')])
  .optional()
  .transform((value) => value ?? '');
const message = z.string().trim().max(4000, 'too-long').optional();

/** Fields shared by the contact, donation and volunteering forms. */
const baseFields = {
  name,
  phone,
  email,
  message,
};

/** The contact form (WPForms 292). */
export const contactSchema = z.object({
  ...baseFields,
  /** Cloudflare Turnstile response token. */
  turnstileToken: z.string().optional(),
  /** Honeypot field — must stay empty. */
  website: z.string().max(0).optional(),
});

/** The donation form (WPForms 742). */
export const donationSchema = z.object({
  ...baseFields,
  donationTypes: z.array(z.string()).default([]),
  turnstileToken: z.string().optional(),
  website: z.string().max(0).optional(),
});

/** The volunteering form (WPForms 768). */
export const volunteerSchema = z.object({
  ...baseFields,
  collaborationTypes: z.array(z.string()).default([]),
  turnstileToken: z.string().optional(),
  website: z.string().max(0).optional(),
});

/** The newsletter form (footer). */
export const newsletterSchema = z.object({
  email: z.email('invalid-email'),
  turnstileToken: z.string().optional(),
  website: z.string().max(0).optional(),
});

export type ContactPayload = z.infer<typeof contactSchema>;
export type DonationPayload = z.infer<typeof donationSchema>;
export type VolunteerPayload = z.infer<typeof volunteerSchema>;
export type NewsletterPayload = z.infer<typeof newsletterSchema>;

/** The validation schema of a form kind. */
export function schemaFor(kind: FormKind) {
  switch (kind) {
    case 'contact':
      return contactSchema;
    case 'donar':
      return donationSchema;
    case 'voluntariado':
      return volunteerSchema;
    case 'newsletter':
      return newsletterSchema;
  }
}

/** Human readable labels of the errors produced by the schemas above. */
export const errorMessages: Record<string, string> = {
  'too-short': 'Este campo es obligatorio.',
  'too-long': 'Este campo es demasiado largo.',
  'invalid-email': 'Introduce un correo electrónico válido.',
};
