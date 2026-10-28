/**
 * Helpers for the WordPress media library.
 */

import { parse as parseYaml } from 'yaml';
import {
  isMediaPath,
  isOwnedWordPressMediaHost,
  mediaKeyFromReference,
  WORDPRESS_UPLOADS_MARKER,
} from '../../src/lib/media-keys.ts';

export {
  isMediaPath,
  WEBP_DELIVERY_WIDTH,
  webpDeliveryKey,
} from '../../src/lib/media-keys.ts';
const FRONTMATTER_MEDIA_KEYS = new Set(['image', 'backgroundImage', 'src']);

/** Public media hosts whose path is already the object key. */
const MEDIA_HOSTS = [/^pub-[a-z0-9]+\.r2\.dev$/i, /^media\.fundacionrosariogaton\.org$/i];

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
  const index = url.indexOf(WORDPRESS_UPLOADS_MARKER);
  if (index === -1) return url;
  return url.slice(index + WORDPRESS_UPLOADS_MARKER.length).replace(/^\/+/, '');
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

/** Collect relative paths from media-bearing Markdown frontmatter properties. */
export function collectRelativeMediaPaths(value: unknown): string[] {
  const found = new Set<string>();

  const visit = (node: unknown, key?: string): void => {
    if (typeof node === 'string') {
      const value = node.trim();
      if (
        !key ||
        !FRONTMATTER_MEDIA_KEYS.has(key) ||
        /^(?:https?:)?\/\//i.test(value)
      ) {
        return;
      }

      const path = value.replace(/^\/+/, '');
      const uploadsPrefix = 'wp-content/uploads/';
      const mediaPath =
        (path.startsWith(uploadsPrefix)
          ? path.slice(uploadsPrefix.length)
          : path
        ).split(/[?#]/, 1)[0] ?? '';
      if (isMediaPath(mediaPath)) found.add(mediaPath);
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) visit(item, key);
      return;
    }

    if (node && typeof node === 'object') {
      for (const [childKey, child] of Object.entries(node)) {
        visit(child, childKey);
      }
    }
  };

  visit(value);
  return [...found];
}

/** Scan one Markdown document for first-party and third-party upload URLs. */
export function collectMarkdownMediaReferences(source: string): {
  own: Set<string>;
  external: Set<string>;
  errors: string[];
} {
  const own = new Set<string>();
  const external = new Set<string>();
  const errors: string[] = [];

  const add = (value: string): void => {
    const clean = value.trim();
    if (!clean) return;

    if (/^(?:https?:)?\/\//i.test(clean)) {
      let url: URL;
      try {
        url = new URL(clean.startsWith('//') ? `https:${clean}` : clean);
      } catch {
        return;
      }

      // Already on the media host: the pathname is the object key.
      if (MEDIA_HOSTS.some((host) => host.test(url.hostname))) {
        const encoded = url.pathname.replace(/^\/+/, '');
        let key = encoded;
        try {
          key = decodeURIComponent(encoded);
        } catch {
          // Keep the encoded key if a URL has invalid percent escapes.
        }
        if (isMediaPath(key)) own.add(key);
        return;
      }

      const index = url.pathname.indexOf(WORDPRESS_UPLOADS_MARKER);
      if (index < 0) return;

      const encodedPath = url.pathname.slice(index + WORDPRESS_UPLOADS_MARKER.length);
      if (!encodedPath) return;

      let path = encodedPath;
      try {
        path = decodeURIComponent(encodedPath);
      } catch {
        // Keep the encoded key if a legacy URL has invalid percent escapes.
      }

      if (!isMediaPath(path)) return;
      if (isOwnedWordPressMediaHost(url.hostname)) {
        own.add(path);
      } else {
        external.add(`${url.hostname}${url.pathname}`);
      }
      return;
    }

    const path =
      clean
        .replace(/^\/+/, '')
        .replace(/^wp-content\/uploads\//, '')
        .split(/[?#]/, 1)[0] ?? '';
    if (isMediaPath(path)) own.add(path);
  };

  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1];
  if (frontmatter) {
    try {
      const data = parseYaml(frontmatter) as unknown;
      for (const path of collectRelativeMediaPaths(data)) add(path);
    } catch {
      errors.push('Frontmatter could not be parsed as YAML');
    }
  }

  const uploadUrlPattern =
    /(?:https?:)?\/\/[^\s"')<>]*\/wp-content\/uploads\/[^\s"')<>]+/gi;
  for (const match of source.matchAll(uploadUrlPattern)) {
    const url = match[0].replace(/[.,;!?]+$/, '');
    add(url);
  }

  const mediaHostPattern =
    /(?:https?:)?\/\/(?:media\.fundacionrosariogaton\.org|pub-[a-z0-9]+\.r2\.dev)\/[^\s"')<>]+/gi;
  for (const match of source.matchAll(mediaHostPattern)) {
    const url = match[0].replace(/[.,;!?]+$/, '');
    add(url);
  }

  return { own, external, errors };
}

/** Extract the static site logo's path without importing Astro runtime config. */
export function extractSiteLogoPath(source: string): string | undefined {
  const match = /^\s*logo:\s*(['"])([^'"]+)\1\s*,?\s*$/m.exec(source);
  const value = match?.[2]?.trim();
  return value ? mediaKeyFromReference(value) : undefined;
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
