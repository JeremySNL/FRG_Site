export const WORDPRESS_UPLOADS_MARKER = '/wp-content/uploads/';

const OWN_WORDPRESS_MEDIA_HOSTS = new Set([
  'fundacionrosariogaton.org',
  'www.fundacionrosariogaton.org',
]);

const MEDIA_EXTENSIONS = new Set([
  '.avif',
  '.gif',
  '.jpeg',
  '.jpg',
  '.mp4',
  '.pdf',
  '.png',
  '.svg',
  '.webm',
  '.webp',
]);

const WEBP_SOURCE_EXTENSIONS = new Set(['.jpeg', '.jpg', '.png', '.webp']);

export const WEBP_VARIANT_WIDTH = 1600;

export function isOwnedWordPressMediaHost(hostname: string): boolean {
  return OWN_WORDPRESS_MEDIA_HOSTS.has(hostname.toLowerCase());
}

/** Check media keys before joining them to local paths or public URLs. */
export function isMediaPath(path: string): boolean {
  const clean = path.split(/[?#]/, 1)[0] ?? '';
  const segments = clean.split('/');
  if (
    !clean ||
    clean.startsWith('/') ||
    clean.includes('\\') ||
    clean.includes(':') ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    return false;
  }

  const dot = clean.lastIndexOf('.');
  return dot >= 0 && MEDIA_EXTENSIONS.has(clean.slice(dot).toLowerCase());
}

/** Map owned WordPress uploads or relative content paths to a safe object key. */
export function mediaKeyFromReference(reference: string): string | undefined {
  const value = reference.trim();
  if (!value) return undefined;

  if (/^(?:https?:)?\/\//i.test(value)) {
    try {
      const url = new URL(value.startsWith('//') ? `https:${value}` : value);
      if (!isOwnedWordPressMediaHost(url.hostname)) return undefined;

      const markerIndex = url.pathname.indexOf(WORDPRESS_UPLOADS_MARKER);
      if (markerIndex < 0) return undefined;

      let key = url.pathname.slice(markerIndex + WORDPRESS_UPLOADS_MARKER.length);
      try {
        key = decodeURIComponent(key);
      } catch {
        // Keep the encoded key if a legacy URL contains malformed escapes.
      }
      return isMediaPath(key) ? key : undefined;
    } catch {
      return undefined;
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return undefined;

  const path =
    value
      .replace(/^\/+/, '')
      .replace(/^wp-content\/uploads\//, '')
      .split(/[?#]/, 1)[0] ?? '';
  return isMediaPath(path) ? path : undefined;
}

/** Raster formats for which the migration creates a WebP delivery variant. */
export function webpVariantKey(path: string): string | undefined {
  const clean = path.split(/[?#]/, 1)[0] ?? '';
  const dot = clean.lastIndexOf('.');
  if (
    !isMediaPath(clean) ||
    dot < 0 ||
    !WEBP_SOURCE_EXTENSIONS.has(clean.slice(dot).toLowerCase())
  ) {
    return undefined;
  }

  return `${clean.slice(0, dot)}-${WEBP_VARIANT_WIDTH}w.webp`;
}
