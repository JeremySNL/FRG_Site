import { expect, it } from 'vitest';
import {
  defaultLocale,
  locales,
  translationLanguageNames,
  translationLocales,
} from '../src/lib/locale-registry.ts';

it('derives the site locale list from the default and translation locales', () => {
  expect(locales).toEqual([defaultLocale, ...translationLocales]);
  expect(translationLocales).not.toContain(defaultLocale);
});

it('defines a translation prompt label for every translation locale', () => {
  expect(Object.keys(translationLanguageNames)).toEqual(translationLocales);
});
