import { describe, expect, it } from 'vitest';
import {
  buildMediaTargets,
  isSafeFolder,
  isoDateOf,
  mediaFolderFor,
  nextOrdinal,
  parseMediaAddArgs,
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
      files: ['a.jpg', 'b.jpg'],
      alt: undefined,
      dryRun: true,
    });
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

  it('requires exactly one folder source', () => {
    expect(() => parseMediaAddArgs(['--file', 'a.jpg'])).toThrow(/--post.*--event/);
    expect(() =>
      parseMediaAddArgs(['--post', 'x', '--event', '2026-11-05-y', '--file', 'a.jpg']),
    ).toThrow(/not both/);
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
