import { describe, expect, it } from 'vitest';
import {
  buildMediaTargets,
  isSafeFolder,
  isoDateOf,
  mediaFolderFor,
  nextOrdinal,
  normalizeDir,
  pageFolder,
  parseMediaAddArgs,
  programKey,
  teamKey,
  versionedKey,
} from '../scripts/lib/media-add.ts';

describe('isSafeFolder', () => {
  it('accepts a normal event folder', () => {
    expect(isSafeFolder('photos/2026-11-05-jornada-medica')).toBe(true);
    expect(isSafeFolder('programs/vivienda-digna')).toBe(true);
  });

  it('rejects absolute, traversing and malformed folders', () => {
    expect(isSafeFolder('')).toBe(false);
    expect(isSafeFolder('/photos/x')).toBe(false);
    expect(isSafeFolder('photos/../etc')).toBe(false);
    expect(isSafeFolder('photos//x')).toBe(false);
    expect(isSafeFolder('photos\\x')).toBe(false);
    expect(isSafeFolder('photos')).toBe(false);
    expect(isSafeFolder('C:/photos/x')).toBe(false);
  });

  it('accepts a one-segment folder only when the caller allows it', () => {
    // `--dir brand` is a real target; `photos` as a numbered folder is not.
    expect(isSafeFolder('brand', 1)).toBe(true);
    expect(isSafeFolder('brand')).toBe(false);
    expect(isSafeFolder('..', 1)).toBe(false);
  });
});

describe('parseMediaAddArgs', () => {
  it('accepts a post and several files', () => {
    expect(
      parseMediaAddArgs([
        '--post',
        'jornada-medica',
        '--file',
        'a.jpg',
        'b.jpg',
        '--dry-run',
      ]),
    ).toEqual({
      post: 'jornada-medica',
      event: undefined,
      page: undefined,
      program: undefined,
      team: undefined,
      dir: undefined,
      files: ['a.jpg', 'b.jpg'],
      alt: undefined,
      dryRun: true,
    });
  });

  it('accepts every target flag', () => {
    expect(parseMediaAddArgs(['--page', 'contacto', '--file', 'a.jpg']).page).toBe(
      'contacto',
    );
    expect(
      parseMediaAddArgs(['--program', 'vivienda', '--file', 'a.jpg']).program,
    ).toBe('vivienda');
    expect(parseMediaAddArgs(['--team', 'rosario-gaton', '--file', 'a.jpg']).team).toBe(
      'rosario-gaton',
    );
    expect(parseMediaAddArgs(['--dir', 'brand/', '--file', 'a.jpg']).dir).toBe('brand');
  });

  it('accepts a repeated --file flag', () => {
    const options = parseMediaAddArgs([
      '--event',
      '2026-11-05-jornada-medica',
      '--file',
      'a.jpg',
      '--file',
      'b.jpg',
    ]);

    expect(options.files).toEqual(['a.jpg', 'b.jpg']);
  });

  it('requires exactly one target', () => {
    expect(() => parseMediaAddArgs(['--file', 'a.jpg'])).toThrow(/Pass one of/);
    expect(() =>
      parseMediaAddArgs(['--post', 'x', '--event', '2026-11-05-y', '--file', 'a.jpg']),
    ).toThrow(/only one target/);
    expect(() =>
      parseMediaAddArgs(['--program', 'x', '--page', 'y', '--file', 'a.jpg']),
    ).toThrow(/only one target/);
  });

  it('rejects several files for a single-asset target', () => {
    expect(() =>
      parseMediaAddArgs(['--program', 'x', '--file', 'a.jpg', 'b.jpg']),
    ).toThrow(/single --file/);
    expect(() =>
      parseMediaAddArgs(['--team', 'x', '--file', 'a.jpg', 'b.jpg']),
    ).toThrow(/single --file/);
  });

  it('requires at least one file', () => {
    expect(() => parseMediaAddArgs(['--post', 'x'])).toThrow(/at least one --file/);
    expect(() => parseMediaAddArgs(['--post', 'x', '--file'])).toThrow(
      /at least one path/,
    );
  });

  it('rejects unknown options and bad shapes', () => {
    expect(() => parseMediaAddArgs(['--nope'])).toThrow(/Unknown option/);
    expect(() => parseMediaAddArgs(['--post', 'No Spaces', '--file', 'a.jpg'])).toThrow(
      /lowercase URL-safe slug/,
    );
    expect(() => parseMediaAddArgs(['--event', 'jornada', '--file', 'a.jpg'])).toThrow(
      /2026-11-05-jornada-medica/,
    );
    expect(() => parseMediaAddArgs(['--dir', '../../etc', '--file', 'a.jpg'])).toThrow(
      /relative folder/,
    );
    expect(() => parseMediaAddArgs(['--dir', '/etc', '--file', 'a.jpg'])).toThrow(
      /relative folder/,
    );
  });
});

describe('target paths', () => {
  it('maps each collection to its folder or fixed key', () => {
    expect(pageFolder('contacto')).toBe('pages/contacto');
    expect(programKey('vivienda-digna')).toBe('programs/vivienda-digna/cover.webp');
    expect(teamKey('rosario-gaton')).toBe('team/rosario-gaton.webp');
  });

  it('trims the trailing slashes a user types around --dir', () => {
    expect(normalizeDir('brand/')).toBe('brand');
    expect(normalizeDir('photos/2026-11-05-x///')).toBe('photos/2026-11-05-x');
    // A leading slash stays, so validation rejects it instead of silently
    // turning an absolute-looking path into a relative one.
    expect(normalizeDir('/brand')).toBe('/brand');
  });
});

describe('versionedKey', () => {
  it('keeps the plain key while it is free', () => {
    expect(versionedKey('programs/x/cover.webp', [])).toBe('programs/x/cover.webp');
    expect(versionedKey('programs/x/cover.webp', ['programs/x/cover-2.webp'])).toBe(
      'programs/x/cover.webp',
    );
  });

  it('bumps the version when the key is taken', () => {
    expect(versionedKey('programs/x/cover.webp', ['programs/x/cover.webp'])).toBe(
      'programs/x/cover-2.webp',
    );
    expect(
      versionedKey('programs/x/cover.webp', [
        'programs/x/cover.webp',
        'programs/x/cover-2.webp',
      ]),
    ).toBe('programs/x/cover-3.webp');
  });

  it('ignores unrelated keys in the same folder', () => {
    expect(
      versionedKey('programs/x/cover.webp', [
        'programs/x/poster.webp',
        'programs/y/cover.webp',
      ]),
    ).toBe('programs/x/cover.webp');
  });

  it('does not re-version an already versioned key', () => {
    expect(versionedKey('team/x-2.webp', ['team/x-2.webp'])).toBe('team/x-3.webp');
  });
});

describe('isoDateOf', () => {
  it('reads the date part of a frontmatter timestamp', () => {
    expect(isoDateOf('2026-11-05T10:00:00')).toBe('2026-11-05');
    expect(isoDateOf(new Date('2026-11-05T23:30:00Z'))).toBe('2026-11-05');
  });

  it('rejects anything that is not a date', () => {
    expect(isoDateOf(undefined)).toBeUndefined();
    expect(isoDateOf('')).toBeUndefined();
    expect(isoDateOf('5 de noviembre')).toBeUndefined();
  });
});

describe('mediaFolderFor', () => {
  it('builds the event folder from the post date and slug', () => {
    expect(mediaFolderFor('2026-11-05', 'jornada-medica-santo-domingo-este')).toBe(
      'photos/2026-11-05-jornada-medica-santo-domingo-este',
    );
  });

  it('drops the organisation prefix that every post slug carries', () => {
    expect(
      mediaFolderFor('2026-11-05', 'fundacion-rosario-gaton-y-jornada-medica'),
    ).toBe('photos/2026-11-05-jornada-medica');
  });
});

describe('nextOrdinal', () => {
  it('starts at one for an empty folder', () => {
    expect(nextOrdinal([])).toBe(1);
  });

  it('continues after the highest number', () => {
    expect(
      nextOrdinal([
        'photos/2026-11-05-x/01-jornada.webp',
        'photos/2026-11-05-x/02-jornada.webp',
      ]),
    ).toBe(3);
  });

  it('ignores keys that are not numbered', () => {
    expect(
      nextOrdinal(['programs/x/cover.webp', 'photos/2026-11-05-x/07-a.webp']),
    ).toBe(8);
  });
});

describe('buildMediaTargets', () => {
  it('numbers files in the given order', () => {
    expect(
      buildMediaTargets(
        'photos/2026-11-05-jornada',
        ['entrega.jpg', 'cierre.jpg'],
        1,
      ).map((target) => target.key),
    ).toEqual([
      'photos/2026-11-05-jornada/01-entrega.webp',
      'photos/2026-11-05-jornada/02-cierre.webp',
    ]);
  });

  it('falls back to a bare ordinal for machine exports', () => {
    expect(
      buildMediaTargets('photos/2026-11-05-x', ['IMG-20251214-WA0165.jpg'], 1)[0]?.key,
    ).toBe('photos/2026-11-05-x/01.webp');
  });

  it('reads the file name from a Windows path', () => {
    expect(
      buildMediaTargets(
        'photos/2026-11-05-x',
        ['.\\fotos\\entrega-alimentos.jpg'],
        1,
      )[0]?.key,
    ).toBe('photos/2026-11-05-x/01-entrega-alimentos.webp');
  });

  it('keeps appending when the folder already has keys', () => {
    expect(buildMediaTargets('photos/2026-11-05-x', ['cierre.jpg'], 3)[0]?.key).toBe(
      'photos/2026-11-05-x/03-cierre.webp',
    );
  });

  it('uses a bare ordinal when the file name carries no word', () => {
    expect(buildMediaTargets('photos/2026-11-05-x', ['a.jpg'], 1)[0]?.key).toBe(
      'photos/2026-11-05-x/01.webp',
    );
  });
});
