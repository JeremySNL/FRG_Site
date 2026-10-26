import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import {
  parsePostReadyArgs,
  translationArgsForPostReady,
} from '../scripts/lib/post-ready.ts';
import { translationLocales } from '../src/lib/locale-registry.ts';

const postReadyScript = resolve(process.cwd(), 'scripts/post-ready.mts');

it('requires a safe post slug', () => {
  expect(() => parsePostReadyArgs([])).toThrow('--slug is required');
  expect(() => parsePostReadyArgs(['--slug', '../secret'])).toThrow(
    'must be a lowercase URL-safe slug',
  );
});

it('defaults to all translated locales and accepts an explicit locale subset', () => {
  expect(parsePostReadyArgs(['--slug', 'new-post']).locales).toEqual(
    translationLocales,
  );
  expect(
    parsePostReadyArgs(['--slug', 'new-post', '--locales', 'fr,en,fr']).locales,
  ).toEqual(['fr', 'en']);
});

it('rejects unsupported locales and unexpected flags', () => {
  expect(() =>
    parsePostReadyArgs(['--slug', 'new-post', '--locales', 'en,xx']),
  ).toThrow('Unknown locale "xx"');
  expect(() => parsePostReadyArgs(['--slug', 'new-post', '--force'])).toThrow(
    'Unknown option "--force"',
  );
});

it('builds a post-scoped translation command without destructive flags', () => {
  const options = parsePostReadyArgs([
    '--slug',
    'new-post',
    '--locales',
    'en,fr',
    '--dry-run',
  ]);

  expect(translationArgsForPostReady(options)).toEqual([
    '--post',
    'new-post',
    '--locales',
    'en,fr',
    '--dry-run',
  ]);
});

it('dry-runs one post without calling the API or changing its source', async () => {
  const slug =
    'neurologia-con-los-especialistas-de-venezuela-y-la-fundacion-rosario-gaton';
  const sourcePath = resolve(process.cwd(), `src/content/es/posts/${slug}.md`);
  const before = await readFile(sourcePath, 'utf8');
  const result = spawnSync(
    process.execPath,
    [
      '--env-file-if-exists=.env',
      postReadyScript,
      '--slug',
      slug,
      '--locales',
      'en',
      '--dry-run',
    ],
    { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
  );
  const after = await readFile(sourcePath, 'utf8');

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain(`posts/${slug}.md`);
  expect(result.stdout).not.toContain('pages/');
  expect(result.stdout).not.toContain('i18n/en.json');
  expect(result.stdout).toContain(
    'Dry run. No API was called and no file was written.',
  );
  expect(after).toBe(before);
});

it('states that media uploads are separate and does not claim to verify R2', async () => {
  const slug =
    'neurologia-con-los-especialistas-de-venezuela-y-la-fundacion-rosario-gaton';
  const result = spawnSync(
    process.execPath,
    [
      '--env-file-if-exists=.env',
      postReadyScript,
      '--slug',
      slug,
      '--locales',
      'en',
      '--dry-run',
    ],
    { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Images must be uploaded separately');
  expect(result.stdout).toContain('does not upload or verify R2 objects');
  expect(result.stdout).toContain('must be uploaded separately');
  expect(result.stdout).not.toContain('npm run deploy');
  expect(result.stdout).not.toContain('push');
});
