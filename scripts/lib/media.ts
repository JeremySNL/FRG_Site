/**
 * Helpers for the WordPress media library.
 */

const UPLOADS_MARKER = '/wp-content/uploads/';

/**
 * Turn a WordPress media URL into the path used by the new media host.
 *
 * `https://…/wp-content/uploads/2025/07/logo.png` → `2025/07/logo.png`
 *
 * The `YYYY/MM` structure is preserved so that the R2 upload can keep the
 * original object keys and every URL keeps working after the migration.
 */
export function toMediaPath(url: string): string {
  if (!url) return '';
  const index = url.indexOf(UPLOADS_MARKER);
  if (index === -1) return url;
  return url.slice(index + UPLOADS_MARKER.length).replace(/^\/+/, '');
}

/** The file name of a media path, without the extension. */
export function mediaBaseName(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.[a-z0-9]+$/i, '');
}

/**
 * Turn a WordPress media URL into a site-relative URL that the new site can
 * resolve through `mediaUrl()`.
 */
export function toMediaReference(url: string): string {
  const path = toMediaPath(url);
  if (!path) return '';
  return path;
}

/** Slugs that are known to be junk in the original blog. */
export const JUNK_SLUGS = new Set([
  'galeria',
  '1267-2',
  '1047-2',
  'ayudas-medicas',
  'ayudas-medicas-2',
  'ayudas-medicas-3',
  'ayudas-medicas-4',
]);

/**
 * Clean a WordPress slug.
 *
 * The original blog contains duplicates (`…-14-11-2025` and `…-14-11-2025-2`)
 * and a few internal-only slugs (`1267-2`). Collisions are resolved by
 * appending a counter.
 */
export function uniqueSlug(slug: string, taken: Set<string>): string {
  let candidate = slug;
  let counter = 2;

  while (taken.has(candidate)) {
    candidate = `${slug}-${counter}`;
    counter += 1;
  }

  taken.add(candidate);
  return candidate;
}
