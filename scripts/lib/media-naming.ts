/**
 * Naming rules for the R2 media keys.
 *
 * The bucket was seeded from WordPress, so every key is
 * `YYYY/MM/<exported-file-name>`. These helpers turn that accident into a
 * predictable structure:
 *
 *   photos/<YYYY-MM-DD>-<evento>/<nn>-<detalle>.webp
 *   pages/<pagina>/<nn>-<detalle>.webp
 *   programs/<programa>/cover.webp
 *   team/<persona>.webp
 *   brand/<nombre>.webp
 *
 * They are pure functions so the rules can be unit tested without touching the
 * filesystem or the bucket.
 */

/** A trailing WordPress resize marker, always at the end of the base name. */
export const DERIVATIVE_SUFFIX = /-\d+x\d+(?:-\d+)?$/;

/** Trailing words that describe the file, not the picture. */
const NOISE_SUFFIX = /-(?:scaled|copy|photoroom|jpe?g|png|webp|jfif)$/;

/** Re-exported noise that WordPress or an editor left in front of the name. */
const NOISE_PREFIX =
  /^(?:img-\d{8}-wa\d+-?|whatsapp-image-|captura-de-pantalla-|microsoftteams-image-?|images?-\d+-?|descarga-?)/;

/** Names that carry no information at all. */
const JUNK_NAME = [
  /^\d+(?:_\d+)+_n(?:-\d+)?$/, // Facebook export
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-\d+)?$/, // UUID
  /^[0-9a-f]{16,}$/, // content hash
  /^\d+$/, // bare counter
  /^(.)\1+$/, // repeated filler letters (ss, nnn, sssss)
  /^imagen\d*$/,
  /^sin-titulo(?:-\d+)?$/,
  /^whatsapp-image-/,
  /^img-\d{8}-wa\d+/,
  /^images?(?:-\d+)?$/,
  /^microsoftteams-image(?:-\d+)?$/,
  /^descarga(?:-\d+)?$/,
];

/** The extension of a key, lowercased, including the dot. */
export function extensionOf(key: string): string {
  const file = key.slice(key.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  return dot < 0 ? '' : file.slice(dot).toLowerCase();
}

/** The last path segment of a key, without its extension. */
export function baseNameOf(key: string): string {
  const file = key.slice(key.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  return dot < 0 ? file : file.slice(0, dot);
}

/** Drop the `-WxH` marker WordPress adds to every resized copy. */
export function stripDerivativeSuffix(key: string): string {
  const slash = key.lastIndexOf('/');
  const dir = key.slice(0, slash + 1);
  const file = key.slice(slash + 1);
  const extension = extensionOf(key);
  const base = extension ? file.slice(0, file.length - extension.length) : file;
  const stripped = base.replace(DERIVATIVE_SUFFIX, '');
  return stripped === base || !stripped ? key : `${dir}${stripped}${extension}`;
}

/** ASCII kebab-case, safe for a URL segment and for a shell. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** Cut a slug at a word boundary so paths stay readable. */
export function truncateSlug(slug: string, max: number): string {
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const boundary = cut.lastIndexOf('-');
  return (boundary > max * 0.5 ? cut.slice(0, boundary) : cut).replace(/-+$/, '');
}

/** Drop dangling connector words left behind by a truncation. */
export function trimDanglingWords(slug: string): string {
  let value = slug;
  let previous = '';
  while (value !== previous) {
    previous = value;
    value = value.replace(/-(?:de|del|la|el|los|las|en|para|con|por|al|y|a|e|o|u)$/, '');
  }
  return value;
}

export function isJunkName(base: string): boolean {
  const value = base.toLowerCase();
  return JUNK_NAME.some((pattern) => pattern.test(value));
}

/** Turn an exported file name into something a human can read. */
export function descriptiveName(base: string): string | undefined {
  let value = base.toLowerCase();

  let previous = '';
  while (value !== previous) {
    previous = value;
    value = value.replace(NOISE_SUFFIX, '');
  }
  value = value.replace(NOISE_PREFIX, '');
  // WhatsApp exports keep their timestamp after the prefix is gone.
  value = value.replace(/^\d{4}-\d{2}-\d{2}-at-\d+-\d+-\d+-[ap]m-?/, '');
  value = value.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  // The folder already carries the organisation name.
  value = value.replace(/^(?:la-)?fundacion-rosario-gaton-(?:y-)?/, '');
  value = value.replace(NOISE_SUFFIX, '');

  // WordPress crop artifacts: `-e1234abcd-focus-0-0-375-240`.
  value = value.replace(/-focus(?:-\d+)+$/, '');
  value = value.replace(/-[0-9a-f]{8}(?:-\d+)?$/, (match) =>
    value.length - match.length >= 4 ? '' : match,
  );
  // A trailing counter only disambiguated the old flat layout.
  value = value.replace(/-\d{1,2}$/, '');

  if (!value || isJunkName(value)) return undefined;

  const slug = truncateSlug(slugify(value), 48);
  if (!slug || isJunkName(slug)) return undefined;

  // A name made only of very short tokens ("as", "ee-1") says nothing.
  const words = slug.split('-');
  if (!words.some((word) => word.length >= 4)) return undefined;

  return slug;
}

/** Event folder slug: drop the organisation name and a redundant date. */
export function cleanEventSlug(slug: string): string {
  const value = slug
    .replace(/^fundacion-rosario-gaton-(?:y-)?/, '')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .replace(/^(?:y|e|de|del|el|la|los|las)-+/, '');
  return trimDanglingWords(truncateSlug(value, 60));
}
