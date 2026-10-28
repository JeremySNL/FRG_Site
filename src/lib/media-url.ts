import { mediaKeyFromReference } from './media-keys.ts';

/** R2 custom domain intended for production. Set via `MEDIA_BASE_URL`. */
export const R2_MEDIA_BASE_URL = 'https://media.fundacionrosariogaton.org';

/** The WordPress uploads host the media was migrated from. Kept for reference. */
export const WORDPRESS_MEDIA_BASE_URL =
  'https://fundacionrosariogaton.org/wp-content/uploads';

export interface MediaUrlOptions {
  baseUrl: string;
}

/**
 * Build consistent media URL settings from the public build-time host.
 *
 * The bucket only stores delivery-ready WebP objects, so a key is served as it
 * is written. The media host is the default: unlike the WordPress uploads URL,
 * it is the only host that actually holds the migrated keys.
 */
export function createMediaUrlOptions(
  configuredBaseUrl?: string | null,
): MediaUrlOptions {
  return {
    baseUrl: (configuredBaseUrl?.trim() || R2_MEDIA_BASE_URL).replace(/\/+$/, ''),
  };
}

function encodeMediaKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

/** Resolve owned media keys while preserving hotlinks and unknown formats. */
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

  return `${options.baseUrl}/${encodeMediaKey(key)}`;
}
