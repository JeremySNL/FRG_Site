import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', 'src', 'content');
const locales = ['es', 'en', 'fr', 'ja', 'zh-TW'] as const;

const plain = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

function frontmatter(text: string): Record<string, unknown> {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return match?.[1] === undefined ? {} : (parse(match[1]) as Record<string, unknown>);
}

/** The country ambassadors of a locale, by continent. */
async function seatsFilled(locale: string): Promise<Map<string, Set<string>>> {
  const dir = join(root, locale, 'team');
  const seats = new Map<string, Set<string>>();

  for (const file of (await readdir(dir)).filter((name) => name.endsWith('.md'))) {
    const data = frontmatter(await readFile(join(dir, file), 'utf8'));
    const { group, continent, country } = data;
    if (group !== 'nacional') continue;
    if (typeof continent !== 'string' || typeof country !== 'string') continue;

    const countries = seats.get(continent) ?? new Set<string>();
    countries.add(plain(country));
    seats.set(continent, countries);
  }

  return seats;
}

describe('open countries of the home page', () => {
  it.each(locales)(
    '%s: no country with an ambassador is still listed as open',
    async (locale) => {
      const page = frontmatter(
        await readFile(join(root, locale, 'pages', 'inicio.md'), 'utf8'),
      );
      const blocks = (page['blocks'] ?? []) as {
        type?: string;
        continents?: unknown;
      }[];
      const block = blocks.find((item) => item.type === 'ambassadors');
      const continents = (block?.continents ?? []) as {
        continent: string;
        openCountries?: string[];
      }[];
      const seats = await seatsFilled(locale);

      expect(continents.length, `${locale} ambassadors block`).toBeGreaterThan(0);

      for (const { continent, openCountries = [] } of continents) {
        for (const country of openCountries) {
          expect(
            seats.get(continent)?.has(plain(country)) ?? false,
            `${locale}: "${country}" already has an ambassador in ${continent}; remove it from openCountries in pages/inicio.md`,
          ).toBe(false);
        }
      }
    },
  );
});
