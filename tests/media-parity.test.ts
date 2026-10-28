import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src', 'content');

const SOURCE = 'es';
const LOCALES = ['en', 'fr', 'ja', 'zh-TW'];
const COLLECTIONS = ['pages', 'posts', 'programs', 'team', 'categories', 'tags'];

/** Frontmatter keys that hold a media reference, at any depth of `blocks`. */
const IMAGE_KEYS = new Set(['image', 'backgroundImage', 'src', 'ogImage']);

const MEDIA_HOST = /^https?:\/\/media\.fundacionrosariogaton\.org\//;

/**
 * Translated documents are generated once and preserved afterwards, so a key
 * added to the Spanish source later never reaches them. That happened to the
 * hero images of eight pages: the Spanish page showed a photo and every other
 * language showed nothing. Images are locale-independent (`image` is in the
 * translator's SKIP_KEYS), so the reference list of a translated document must
 * be identical to its source.
 */

function collectImages(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectImages(item, found);
    return found;
  }

  if (node === null || typeof node !== 'object') return found;

  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string') {
      if (IMAGE_KEYS.has(key)) found.push(value.trim());
      continue;
    }
    collectImages(value, found);
  }

  return found;
}

/** Every media reference of a document, in document order, without the host. */
function mediaReferences(source: string): string[] {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  const data = match ? ((parseYaml(match[1] ?? '') ?? {}) as unknown) : {};
  const body = match?.[2] ?? '';

  const found = collectImages(data);

  for (const image of body.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)/g)) {
    if (image[1]) found.push(image[1]);
  }
  for (const image of body.matchAll(/<img[^>]*?src=["']([^"']+)/gi)) {
    if (image[1]) found.push(image[1]);
  }

  return found.map((value) => value.replace(MEDIA_HOST, '').replace(/^\/+/, ''));
}

async function documentsOf(locale: string, collection: string): Promise<string[]> {
  try {
    const files = await readdir(join(contentDir, locale, collection));
    return files.filter((file) => file.endsWith('.md'));
  } catch {
    return [];
  }
}

describe('media parity between the Spanish source and every translation', () => {
  for (const collection of COLLECTIONS) {
    it(`keeps ${collection} images identical to the source`, async () => {
      const sourceFiles = await documentsOf(SOURCE, collection);
      const comparisons: string[] = [];

      for (const file of sourceFiles) {
        const source = mediaReferences(
          await readFile(join(contentDir, SOURCE, collection, file), 'utf8'),
        );

        for (const locale of LOCALES) {
          // A document that was never translated on purpose (pre-cutoff posts)
          // has no counterpart and cannot disagree.
          if (!(await documentsOf(locale, collection)).includes(file)) continue;

          const translated = mediaReferences(
            await readFile(join(contentDir, locale, collection, file), 'utf8'),
          );

          if (source.join('\n') !== translated.join('\n')) {
            comparisons.push(
              `${locale}/${collection}/${file} has ${translated.length} image(s), source has ${source.length}`,
            );
          }
        }
      }

      expect(comparisons).toEqual([]);
    });
  }
});
