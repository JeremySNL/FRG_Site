/**
 * Global site configuration.
 *
 * Every value here was extracted from the WordPress database
 * (`wp_options`, the Elementor header template id 182 and the footer
 * template id 481) — nothing is invented.
 */
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
   * The default still points at the WordPress uploads folder so the site
   * shows the real pictures while the R2 bucket is being filled. Once the
   * migration is done, set `MEDIA_BASE_URL` to the media host and the paths
   * stay the same.
   */
  mediaBaseUrl:
    import.meta.env.MEDIA_BASE_URL ??
    'https://fundacionrosariogaton.org/wp-content/uploads',

  /** Attachment id 201 in WordPress — the FRG logo used in header and footer. */
  logo: '2025/07/309789749_177982111461367_3349876411011993474_n-Photoroom.png',
} as const;

/** Build an absolute media URL from a path stored in content frontmatter. */
export function mediaUrl(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  const base = site.mediaBaseUrl.replace(/\/+$/, '');
  return `${base}/${path.replace(/^\/+/, '')}`;
}
