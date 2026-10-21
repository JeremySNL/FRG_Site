/**
 * Interface strings for the site chrome (navigation, buttons, form labels,
 * accessibility text, …).
 *
 * Spanish is the source language and is always complete. The other locales
 * are filled in by `scripts/translate.mts`; anything still missing falls back
 * to the Spanish string, so a partially translated locale is never broken.
 */
import type { Locale } from './locales.ts';
import { defaultLocale } from './locales.ts';

export interface UiStrings {
  skipToContent: string;
  openMenu: string;
  closeMenu: string;
  mainMenu: string;
  language: string;
  chooseLanguage: string;
  donate: string;
  quickLinks: string;
  contact: string;
  newsletterTitle: string;
  newsletterText: string;
  newsletterPlaceholder: string;
  newsletterSubmit: string;
  newsletterSuccess: string;
  newsletterError: string;
  copyright: string;
  readMore: string;
  latestPosts: string;
  allPosts: string;
  relatedPosts: string;
  categories: string;
  tags: string;
  share: string;
  publishedOn: string;
  notFoundTitle: string;
  notFoundText: string;
  backHome: string;
  /** Shown when an archive has no posts yet. */
  noPosts: string;
  /** Shown on the team page while the team members are not published yet. */
  teamEmpty: string;
  translationPendingTitle: string;
  translationPendingText: string;
  form: {
    name: string;
    phone: string;
    email: string;
    message: string;
    optional: string;
    required: string;
    submit: string;
    sending: string;
    success: string;
    error: string;
    rateLimited: string;
    invalidToken: string;
    contactTitle: string;
    contactText: string;
    donateTitle: string;
    donateText: string;
    donationType: string;
    donationTypePlaceholder: string;
    volunteerTitle: string;
    volunteerText: string;
    volunteerType: string;
    volunteerTypePlaceholder: string;
  };
}

const es: UiStrings = {
  skipToContent: 'Ir al contenido principal',
  openMenu: 'Abrir menú',
  closeMenu: 'Cerrar menú',
  mainMenu: 'Menú principal',
  language: 'Idioma',
  chooseLanguage: 'Elige un idioma',
  donate: 'Donar',
  quickLinks: 'Enlaces rápidos',
  contact: 'Contacto',
  newsletterTitle: 'Suscríbete a nuestras noticias',
  newsletterText: 'Recibe novedades sobre nuestros programas, eventos y resultados.',
  newsletterPlaceholder: 'Tu correo electrónico',
  newsletterSubmit: 'Suscribirme',
  newsletterSuccess: '¡Gracias! Te has suscrito correctamente.',
  newsletterError: 'No fue posible completar la suscripción. Inténtalo de nuevo.',
  copyright: 'Todos los derechos reservados.',
  readMore: 'Leer más',
  latestPosts: 'Publicaciones recientes',
  allPosts: 'Ver todas las publicaciones',
  relatedPosts: 'Publicaciones relacionadas',
  categories: 'Categorías',
  tags: 'Etiquetas',
  share: 'Compartir',
  publishedOn: 'Publicado el',
  notFoundTitle: 'Página no encontrada',
  notFoundText:
    'La página que buscas no existe o fue movida. Puedes volver al inicio o explorar nuestras publicaciones.',
  backHome: 'Volver al inicio',
  noPosts: 'Todavía no hay publicaciones en esta sección.',
  teamEmpty: 'El equipo de la Fundación Rosario Gatón se publicará muy pronto.',
  translationPendingTitle: 'Traducción en curso',
  translationPendingText:
    'Esta página todavía no está disponible en este idioma. Mientras tanto puedes consultarla en español.',
  form: {
    name: 'Nombre completo',
    phone: 'Teléfono',
    email: 'Correo electrónico',
    message: 'Mensaje',
    optional: 'opcional',
    required: 'obligatorio',
    submit: 'Enviar',
    sending: 'Enviando…',
    success: '¡Gracias! Hemos recibido tu mensaje y te responderemos pronto.',
    error: 'No fue posible enviar el formulario. Inténtalo de nuevo.',
    rateLimited: 'Demasiados envíos. Espera un momento e inténtalo de nuevo.',
    invalidToken: 'No se pudo verificar que no eres un robot. Recarga la página e inténtalo de nuevo.',
    contactTitle: 'Escríbenos',
    contactText: 'Completa el formulario y te responderemos lo antes posible.',
    donateTitle: 'Realiza tu donación',
    donateText:
      'Indícanos cómo te gustaría apoyar nuestro trabajo. Te contactaremos para coordinar el proceso.',
    donationType: '¿Qué desea donar?',
    donationTypePlaceholder: 'Selecciona una opción',
    volunteerTitle: 'Únete como voluntario',
    volunteerText:
      'Cuéntanos en qué te gustaría colaborar. Nuestro equipo se pondrá en contacto contigo.',
    volunteerType: 'Área de colaboración',
    volunteerTypePlaceholder: 'Selecciona una opción',
  },
};

const en: Partial<UiStrings> = {
  skipToContent: 'Skip to main content',
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
  mainMenu: 'Main menu',
  language: 'Language',
  chooseLanguage: 'Choose a language',
  donate: 'Donate',
  quickLinks: 'Quick links',
  contact: 'Contact',
  newsletterTitle: 'Subscribe to our news',
  newsletterText: 'Get updates on our programs, events and results.',
  newsletterPlaceholder: 'Your email address',
  newsletterSubmit: 'Subscribe',
  newsletterSuccess: 'Thank you! You have been subscribed.',
  newsletterError: 'We could not complete the subscription. Please try again.',
  copyright: 'All rights reserved.',
  readMore: 'Read more',
  latestPosts: 'Latest posts',
  allPosts: 'View all posts',
  relatedPosts: 'Related posts',
  categories: 'Categories',
  tags: 'Tags',
  share: 'Share',
  publishedOn: 'Published on',
  notFoundTitle: 'Page not found',
  notFoundText:
    'The page you are looking for does not exist or has moved. Head back home or browse our posts.',
  backHome: 'Back to home',
  noPosts: 'There are no posts in this section yet.',
  teamEmpty: 'The Fundación Rosario Gatón team will be published very soon.',
  translationPendingTitle: 'Translation in progress',
  translationPendingText:
    'This page is not available in this language yet. In the meantime you can read it in Spanish.',
  form: {
    name: 'Full name',
    phone: 'Phone',
    email: 'Email address',
    message: 'Message',
    optional: 'optional',
    required: 'required',
    submit: 'Send',
    sending: 'Sending…',
    success: 'Thank you! We received your message and will get back to you soon.',
    error: 'We could not send the form. Please try again.',
    rateLimited: 'Too many requests. Please wait a moment and try again.',
    invalidToken: 'We could not verify that you are not a robot. Please reload the page and try again.',
    contactTitle: 'Write to us',
    contactText: 'Fill in the form and we will get back to you as soon as possible.',
    donateTitle: 'Make your donation',
    donateText:
      'Tell us how you would like to support our work. We will contact you to coordinate the process.',
    donationType: 'What would you like to donate?',
    donationTypePlaceholder: 'Select an option',
    volunteerTitle: 'Join as a volunteer',
    volunteerText:
      'Tell us how you would like to help out. Our team will get in touch with you.',
    volunteerType: 'Area of collaboration',
    volunteerTypePlaceholder: 'Select an option',
  },
};

/**
 * Raw, possibly partial, per-locale string tables. `scripts/translate.mts`
 * writes the missing locales into this file.
 */
const tables: Record<Locale, Partial<UiStrings>> = {
  es,
  en,
  fr: {},
  ja: {},
  'zh-TW': {},
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merge `overrides` on top of `base`, ignoring `undefined` values. */
function merge<T extends Record<string, unknown>>(base: T, overrides: Partial<T>): T {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const current = result[key];
    result[key] =
      isPlainObject(current) && isPlainObject(value)
        ? merge(current as Record<string, unknown>, value as Record<string, unknown>)
        : value;
  }

  return result as T;
}

const cache = new Map<Locale, UiStrings>();

/**
 * Fully-populated UI strings for a locale. Any string that has not been
 * translated yet falls back to the Spanish original.
 */
export function getUi(locale: Locale): UiStrings {
  const cached = cache.get(locale);
  if (cached) return cached;

  const resolved = merge(es as unknown as Record<string, unknown>, tables[locale] ?? {}) as unknown as UiStrings;
  cache.set(locale, resolved);
  return resolved;
}

export { defaultLocale };
