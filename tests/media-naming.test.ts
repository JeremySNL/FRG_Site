import { describe, expect, it } from 'vitest';
import {
  cleanEventSlug,
  DERIVATIVE_SUFFIX,
  descriptiveName,
  isJunkName,
  stripDerivativeSuffix,
  trimDanglingWords,
  truncateSlug,
} from '../scripts/lib/media-naming.ts';

describe('stripDerivativeSuffix', () => {
  it('drops the WordPress resize marker and keeps the extension', () => {
    expect(stripDerivativeSuffix('2025/12/IMG-20251214-WA0165-300x226.jpg')).toBe(
      '2025/12/IMG-20251214-WA0165.jpg',
    );
    expect(stripDerivativeSuffix('2026/03/Delegados-300x169.jpeg')).toBe('2026/03/Delegados.jpeg');
  });

  it('also drops a dedupe counter that follows the marker', () => {
    expect(stripDerivativeSuffix('2025/07/jovenes-colombia-1-2100x1402-1.jpg')).toBe(
      '2025/07/jovenes-colombia-1.jpg',
    );
  });

  it('leaves plain keys untouched', () => {
    expect(stripDerivativeSuffix('photos/2026-10-23-asamblea/01.webp')).toBe(
      'photos/2026-10-23-asamblea/01.webp',
    );
  });
});

describe('descriptiveName', () => {
  it('keeps a real name', () => {
    expect(descriptiveName('Delegados')).toBe('delegados');
    expect(descriptiveName('taller-de-capacitacion-del-campus-virtual')).toBe(
      'taller-de-capacitacion-del-campus-virtual',
    );
  });

  it('rejects machine exports', () => {
    expect(descriptiveName('119037367_3058066080959212_1519807293402683179_n')).toBeUndefined();
    expect(
      descriptiveName('1416b2d2-c186-4c81-9cd1-351d8146f2aa'),
    ).toBeUndefined();
    expect(descriptiveName('cd44ce519e37e68e392d0a66435c619e')).toBeUndefined();
    expect(descriptiveName('WhatsApp-Image-2026-01-13-at-10.29.15-PM')).toBeUndefined();
    expect(descriptiveName('IMG-20251214-WA0165')).toBeUndefined();
    expect(descriptiveName('Sin-titulo')).toBeUndefined();
    expect(descriptiveName('sssss')).toBeUndefined();
    expect(descriptiveName('as')).toBeUndefined();
    expect(descriptiveName('Imagen2')).toBeUndefined();
  });

  it('strips export timestamps, organisation prefixes and counter suffixes', () => {
    expect(descriptiveName('WhatsApp-Image-2025-12-31-at-9.41.31-AM')).toBeUndefined();
    expect(descriptiveName('La-Fundacion-Rosario-Gaton-y-el-dr-Cruz-Jiminian')).toBe(
      'el-dr-cruz-jiminian',
    );
    expect(descriptiveName('Delegados-1')).toBe('delegados');
  });

  it('cleans WordPress crop artifacts', () => {
    expect(descriptiveName('seguridad-vial-rd-e9229e09-focus-0-0-375-240-1')).toBe(
      'seguridad-vial-rd',
    );
    expect(descriptiveName('Afiche-JPEG')).toBe('afiche');
  });
});

describe('isJunkName', () => {
  it('flags filler and exports', () => {
    expect(isJunkName('nnn')).toBe(true);
    expect(isJunkName('images-1')).toBe(true);
    expect(isJunkName('descarga-1')).toBe(true);
    expect(isJunkName('balaguer')).toBe(false);
  });
});

describe('slug helpers', () => {
  it('cuts at a word boundary', () => {
    expect(truncateSlug('fortalecimiento-institucional-y-valores-democraticos', 20)).toBe(
      'fortalecimiento',
    );
  });

  it('removes dangling connectors after a cut', () => {
    expect(trimDanglingWords('recibe-al-embajador-luis-gonzalez-para-de')).toBe(
      'recibe-al-embajador-luis-gonzalez',
    );
  });

  it('cleans an event slug', () => {
    expect(cleanEventSlug('fundacion-rosario-gaton-y-el-dr-cruz-jiminian-14-11-2025')).toBe(
      'dr-cruz-jiminian-14-11-2025',
    );
    expect(cleanEventSlug('2025-11-13-y-dr-cruz-jiminian-solidaridad')).toBe(
      'dr-cruz-jiminian-solidaridad',
    );
  });
});

describe('DERIVATIVE_SUFFIX', () => {
  it('matches a trailing marker only', () => {
    expect(DERIVATIVE_SUFFIX.test('photo-300x226')).toBe(true);
    expect(DERIVATIVE_SUFFIX.test('photo-300x226-1')).toBe(true);
    expect(DERIVATIVE_SUFFIX.test('photo-300x226-extra')).toBe(false);
  });
});
