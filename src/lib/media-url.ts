import { mediaKeyFromReference, webpVariantKey } from './media-keys.ts';

/** R2 custom domain intended for production. Set via `MEDIA_BASE_URL`. */
export const R2_MEDIA_BASE_URL = 'https://media.fundacionrosariogaton.org';

export const WORDPRESS_MEDIA_BASE_URL =
  'https://fundacionrosariogaton.org/wp-content/uploads';

export interface MediaUrlOptions {
  baseUrl: string;
  useWebp: boolean;
}

/** Build consistent media URL settings from the public build-time host. */
export function createMediaUrlOptions(
  configuredBaseUrl?: string | null,
): MediaUrlOptions {
  const configured = configuredBaseUrl?.trim();
  return {
    baseUrl: (configured || WORDPRESS_MEDIA_BASE_URL).replace(/\/+$/, ''),
    useWebp: Boolean(configured),
  };
}

function encodeMediaKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

/** Resolve owned images to uploaded WebP variants while preserving hotlinks and gaps. */
export function resolveMediaUrl(path: string, options: MediaUrlOptions): string {
  const value = path.trim();
  if (!value) return '';

  const key = mediaKeyFromReference(value);
  if (!key) {
    if (/^(?:https?:)?\/\//i.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
      return path;
    }

    return '';
  }

  const deliveryKey = options.useWebp ? (webpVariantKey(key) ?? key) : key;
  return `${options.baseUrl}/${encodeMediaKey(deliveryKey)}`;
}
