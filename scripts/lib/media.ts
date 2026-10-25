/**
 * Helpers for the WordPress media library.
 */

import { parse as parseYaml } from 'yaml';

const UPLOADS_MARKER = '/wp-content/uploads/';
const OWN_MEDIA_HOSTS = new Set([
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
const FRONTMATTER_MEDIA_KEYS = new Set(['image', 'backgroundImage', 'src']);

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

/** Whether a path has a media extension handled by the migration script. */
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

/** Raster formats for which the migration creates a WebP delivery variant. */
export function webpVariantKey(path: string): string | undefined {
  const clean = path.split(/[?#]/, 1)[0] ?? '';
  const dot = clean.lastIndexOf('.');
  if (dot < 0 || !WEBP_SOURCE_EXTENSIONS.has(clean.slice(dot).toLowerCase())) {
    return undefined;
  }

  return `${clean.slice(0, dot)}-1600w.webp`;
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
      for (const item of node) visit(item);
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
} {
  const own = new Set<string>();
  const external = new Set<string>();

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

      const index = url.pathname.indexOf(UPLOADS_MARKER);
      if (index < 0) return;

      const encodedPath = url.pathname.slice(index + UPLOADS_MARKER.length);
      if (!encodedPath) return;

      let path = encodedPath;
      try {
        path = decodeURIComponent(encodedPath);
      } catch {
        // Keep the encoded key if a legacy URL has invalid percent escapes.
      }

      if (!isMediaPath(path)) return;
      if (OWN_MEDIA_HOSTS.has(url.hostname.toLowerCase())) {
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
    const data = parseYaml(frontmatter) as unknown;
    for (const path of collectRelativeMediaPaths(data)) add(path);
  }

  const uploadUrlPattern =
    /(?:https?:)?\/\/[^\s"')<>]*\/wp-content\/uploads\/[^\s"')<>]+/gi;
  for (const match of source.matchAll(uploadUrlPattern)) {
    const url = match[0].replace(/[.,;!?]+$/, '');
    add(url);
  }

  return { own, external };
}

/** Extract the static site logo's path without importing Astro runtime config. */
export function extractSiteLogoPath(source: string): string | undefined {
  const match = /^\s*logo:\s*(['"])([^'"]+)\1\s*,?\s*$/m.exec(source);
  const path = match?.[2];
  return path && isMediaPath(path) ? path : undefined;
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
