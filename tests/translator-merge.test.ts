/**
 * Unit tests for the merge strategy used when an interface table already
 * exists: the previous table only wins where it actually holds a readable
 * value. `null`, empty strings, and keys that no longer exist in the Spanish
 * table must never overwrite a freshly translated value nor resurrect dead
 * keys into the output.
 */
import { mergeBaseWins } from '../scripts/lib/translate.ts';
import { describe, expect, it } from 'vitest';

describe('mergeBaseWins', () => {
  it('lets the freshly translated value win over a null or empty base value', () => {
    const regenerated = { form: { submit: '送出' } };
    const base = { form: { submit: null } };

    expect(mergeBaseWins(regenerated, base)).toEqual({ form: { submit: '送出' } });
  });

  it('keeps a manual polish when the base holds a readable value', () => {
    const regenerated = { form: { submit: '送出' } };
    const base = { form: { submit: '送出您的訊息' } };

    expect(mergeBaseWins(regenerated, base)).toEqual({ form: { submit: '送出您的訊息' } });
  });

  it('drops base-only keys that no longer exist in the Spanish table', () => {
    const regenerated = { nav: 'Navegación' };
    const base = { nav: '導覽', removedKey: '死鍵' };

    expect(mergeBaseWins(regenerated, base)).toEqual({ nav: '導覽' });
  });

  it('recurses into nested objects without resurrecting dead keys', () => {
    const regenerated = { a: { deep: 'x' } };
    const base = { a: { deep: 'X', gone: '' } , b: 'dropped' };

    expect(mergeBaseWins(regenerated, base)).toEqual({ a: { deep: 'X' } });
  });

  it('keeps arrays as plain values, translated ones winning only over empties', () => {
    const regenerated = { list: ['nuevo'] };
    const base = { list: ['polido'] };

    expect(mergeBaseWins(regenerated, base)).toEqual({ list: ['polido'] });

    const emptyBase = { list: [] };
    expect(mergeBaseWins(regenerated, emptyBase)).toEqual({ list: ['nuevo'] });
  });
});
