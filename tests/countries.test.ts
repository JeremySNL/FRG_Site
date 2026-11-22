import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countryName, localizeCountries } from '../scripts/lib/translate.ts';

const root = join(import.meta.dirname, '..', 'src', 'content');
const translated = ['en', 'fr', 'ja', 'zh-TW'] as const;

const countryOf = (text: string) => /^country:\s*"([^"]+)"/m.exec(text)?.[1];

describe('countryName', () => {
  it('returns the name of a country in each locale', () => {
    expect(countryName('Libia', 'en')).toBe('Libya');
    expect(countryName('Libia', 'fr')).toBe('Libye');
    expect(countryName('Libia', 'ja')).toBe('リビア');
    expect(countryName('Venezuela', 'zh-TW')).toBe('委內瑞拉');
  });

  it('ignores case and accents in the Spanish name', () => {
    expect(countryName('italia', 'en')).toBe('Italy');
    expect(countryName('LÍBANO', 'en')).toBe('Lebanon');
  });

  it('keeps the spellings the site already publishes', () => {
    expect(countryName('Gambia', 'en')).toBe('The Gambia');
    expect(countryName('Palestina', 'fr')).toBe('Palestine');
    expect(countryName('Guinea Conakri', 'en')).toBe('Guinea-Conakry');
  });

  it('does not know a country it has not been given', () => {
    expect(countryName('Atlantis', 'en')).toBeUndefined();
  });
});

describe('localizeCountries', () => {
  it('replaces every country and leaves the rest of the document alone', () => {
    const document = {
      name: 'Ahmed',
      country: 'Libia',
      nested: [{ country: 'Italia', role: 'Embajador en Italia' }],
    };

    expect(localizeCountries(document, 'en')).toEqual({
      name: 'Ahmed',
      country: 'Libya',
      nested: [{ country: 'Italy', role: 'Embajador en Italia' }],
    });
  });

  it('keeps a value that is not in the table, such as one already translated', () => {
    expect(localizeCountries({ country: 'Libya' }, 'en')).toEqual({ country: 'Libya' });
    expect(localizeCountries({ country: 'Atlantis' }, 'fr')).toEqual({
      country: 'Atlantis',
    });
  });

  it('does not change the original document', () => {
    const document = { country: 'Libia' };
    localizeCountries(document, 'en');
    expect(document.country).toBe('Libia');
  });
});

describe('country names of the team documents', () => {
  it('are in the table for every ambassador and match it in every locale', async () => {
    const files = (await readdir(join(root, 'es', 'team'))).filter((name) =>
      name.endsWith('.md'),
    );

    for (const file of files) {
      const spanish = countryOf(await readFile(join(root, 'es', 'team', file), 'utf8'));
      if (spanish === undefined) continue;

      for (const locale of translated) {
        const expected = countryName(spanish, locale);
        expect(
          expected,
          `"${spanish}" (es/team/${file}) is missing from scripts/lib/countries.json`,
        ).toBeDefined();

        const copy = await readFile(join(root, locale, 'team', file), 'utf8');
        expect(countryOf(copy), `${locale}/team/${file} country`).toBe(expected);
      }
    }
  });
});
