/**
 * Global site configuration.
 *
 * Every value here was extracted from the WordPress database
 * (`wp_options`, the Elementor header template id 182 and the footer
 * template id 481) — nothing is invented.
 */
import { createMediaUrlOptions, resolveMediaUrl } from './media-url.ts';

const configuredMediaBaseUrl =
  import.meta.env.MEDIA_BASE_URL ?? import.meta.env.R2_PUBLIC_URL;

export const mediaUrlOptions = createMediaUrlOptions(configuredMediaBaseUrl);

export const site = {
  name: 'Fundación Rosario Gatón',
  shortName: 'FRG',
  /** `blogdescription` in WordPress. */
  tagline: 'Promoviendo derechos humanos y desarrollo sostenible para todos.',
  /** Footer blurb in the original Elementor footer template. */
  mission: 'Trabajamos por un mundo más justo, humano y sostenible.',
  url: 'https://fundacionrosariogaton.org',

  email: 'info@fundacionrosariogaton.org',
  /** Header telephone number. */
  phone: '(809) 290-2255',
  /** Header + footer WhatsApp number, digits only (for wa.me links). */
  whatsapp: '18296493189',
  whatsappDisplay: '(829) 649-3189',

  address: {
    street: 'C/ Castillo Esq. 27 de Febrero, Edificio Plaza Park, 2do. Nivel',
    city: 'San Fernando de la Maguana',
    region: 'Samaná',
    country: 'República Dominicana',
  },

  social: {
    facebook: 'https://www.facebook.com/FundacionRosarioGaton',
    instagram: 'https://www.instagram.com/fundacionrosariogaton/',
  },

  /**
   * Where migrated media is served from.
   *
   * Set `MEDIA_BASE_URL` to override the public R2 URL for later domain changes.
   * `R2_PUBLIC_URL` is the migration host; WordPress remains the fallback.
   */
  mediaBaseUrl: mediaUrlOptions.baseUrl,

  /** Attachment id 201 in WordPress — the FRG logo used in header and footer. */
  logo: 'brand/logo.webp',
} as const;

/** Build an absolute media URL from a path stored in content frontmatter. */
export function mediaUrl(path: string): string {
  return resolveMediaUrl(path, mediaUrlOptions);
}
