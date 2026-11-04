import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { localizeLinks } from '../scripts/lib/translate.ts';
import { translationLocales } from '../src/lib/locale-registry.ts';
import { localizeHref } from '../src/lib/locales.ts';

/**
 * A button of a translated page must stay in that language: `/donar/` on the
 * French home page sends a French reader to the Spanish donation page. The
 * translator copies values it does not translate, links included, so the
 * links of every copy are localized and this file pins it.
 */

describe('localizeHref', () => {
  it('prefixes an internal page link with the locale', () => {
    expect(localizeHref('/donar/', 'fr')).toBe('/fr/donar/');
    expect(localizeHref('/', 'ja')).toBe('/ja/');
    expect(localizeHref('/actualidades/hola/', 'zh-TW')).toBe(
      '/zh-TW/actualidades/hola/',
    );
  });

  it('keeps the anchor and the query string', () => {
    expect(localizeHref('/donar/#formulario', 'en')).toBe('/en/donar/#formulario');
    expect(localizeHref('/voluntariado/?pais=Chile', 'en')).toBe(
      '/en/voluntariado/?pais=Chile',
    );
  });

  it('leaves alone what is not a Spanish page link', () => {
    expect(localizeHref('/en/donar/', 'en')).toBe('/en/donar/');
    expect(localizeHref('/donar/', 'es')).toBe('/donar/');
    expect(localizeHref('https://wa.me/18296493189', 'fr')).toBe(
      'https://wa.me/18296493189',
    );
    expect(localizeHref('//cdn.example.org/a/', 'fr')).toBe('//cdn.example.org/a/');
    expect(localizeHref('/favicon.png', 'fr')).toBe('/favicon.png');
    expect(localizeHref('#formulario', 'fr')).toBe('#formulario');
  });
});

describe('localizeLinks', () => {
  it('localizes every href of a document and nothing else', () => {
    const data = {
      slug: 'inicio',
      image: 'photos/x.webp',
      blocks: [{ buttons: [{ label: 'Donar', href: '/donar/' }] }],
    };

    expect(localizeLinks(data, 'fr')).toEqual({
      slug: 'inicio',
      image: 'photos/x.webp',
      blocks: [{ buttons: [{ label: 'Donar', href: '/fr/donar/' }] }],
    });
  });
});

describe('translated content', () => {
  const contentDir = join(process.cwd(), 'src', 'content');

  const hrefsOf = (node: unknown): string[] => {
    if (Array.isArray(node)) return node.flatMap(hrefsOf);
    if (node && typeof node === 'object') {
      return Object.entries(node).flatMap(([key, value]) =>
        key === 'href' && typeof value === 'string' ? [value] : hrefsOf(value),
      );
    }
    return [];
  };

  for (const locale of translationLocales) {
    it(`links the pages of ${locale} to pages in ${locale}`, () => {
      const unlocalized: string[] = [];

      for (const collection of readdirSync(join(contentDir, locale))) {
        for (const file of readdirSync(join(contentDir, locale, collection))) {
          if (!file.endsWith('.md')) continue;

          const source = readFileSync(
            join(contentDir, locale, collection, file),
            'utf8',
          );
          const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? '';

          for (const href of hrefsOf(parseYaml(frontmatter))) {
            if (localizeHref(href, locale) !== href) {
              unlocalized.push(`${collection}/${file}: ${href}`);
            }
          }
        }
      }

      expect(unlocalized).toEqual([]);
    });
  }
});
