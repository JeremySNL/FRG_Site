/**
 * Unit tests for the translator's guard predicates: which Spanish source
 * documents the pipeline skips by rule, and what makes an existing locale
 * copy an untranslated fingerprint of a crashed batch.
 */
import {
  isIdentityProse,
  isSkippedSource,
} from '../scripts/lib/translate.ts';
import { describe, expect, it } from 'vitest';

describe('isSkippedSource', () => {
  it('skips documents flagged noAutoTranslate, whatever the collection', () => {
    expect(isSkippedSource({ noAutoTranslate: true }, 'pages')).toBe(true);
    expect(isSkippedSource({ noAutoTranslate: true }, 'posts')).toBe(true);
  });

  it('skips posts published before the translation cutoff', () => {
    expect(isSkippedSource({ date: '2024-12-31' }, 'posts')).toBe(true);
  });

  it('translates posts from the cutoff onward', () => {
    expect(isSkippedSource({ date: '2025-01-01' }, 'posts')).toBe(false);
    expect(isSkippedSource({ date: '2026-03-15' }, 'posts')).toBe(false);
  });

  it('never skips pages by date', () => {
    expect(isSkippedSource({ date: '2019-02-03' }, 'pages')).toBe(false);
  });

  it('does not skip a translated post with an unrelated noAutoTranslate value', () => {
    expect(isSkippedSource({ noAutoTranslate: false, date: '2026-01-02' }, 'posts')).toBe(
      false,
    );
  });
});

describe('isIdentityProse', () => {
  it('flags a copy whose prose is still the Spanish source', () => {
    const source = '**Santo Domingo.** La fundación continúa.\n\nSegundo párrafo.';
    expect(isIdentityProse(source, source)).toBe(true);
  });

  it('accepts a translated copy even when wording differs slightly', () => {
    const source = 'La fundación continúa fortaleciendo sus relaciones.';
    const translated = 'La funda繼續加強其機構關係。';
    expect(isIdentityProse(source, translated)).toBe(false);
  });

  it('ignores URLs, images, and inline HTML, which are locale-independent', () => {
    const source = 'Texto traducible [con un enlace](https://example.com/a).';
    const copy =
      'Texto traducible [con un enlace](https://example.com/b) <https://otro.org> ![](img.jpg)';
    expect(isIdentityProse(source, copy)).toBe(true);
  });

  it('never flags URL-only bodies, which are untranslatable by design', () => {
    expect(isIdentityProse('https://www.facebook.com/share/p/abc', 'https://x.com/1')).toBe(
      false,
    );
  });

  it('never flags empty bodies', () => {
    expect(isIdentityProse('', '')).toBe(false);
  });
});
