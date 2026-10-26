import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

const translateScript = resolve(process.cwd(), 'scripts/translate.mts');

it('does not start the translation workflow when imported', () => {
  const entry = `process.argv = [process.execPath, 'test-runner.mjs', '--dry-run', '--locale', 'en']; await import(${JSON.stringify(pathToFileURL(translateScript).href)});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', entry], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe('');
});

it('keeps dry-run locale selection working from the CLI', () => {
  const result = spawnSync(
    process.execPath,
    ['--env-file-if-exists=.env', translateScript, '--dry-run', '--locale', 'en'],
    { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('=== en (English) ===');
  expect(result.stdout).not.toContain('=== fr');
  expect(result.stdout).toContain(
    'Dry run. No API was called and no file was written.',
  );
});

it('dry-runs only the selected post without translating unrelated collections', () => {
  const slug =
    'neurologia-con-los-especialistas-de-venezuela-y-la-fundacion-rosario-gaton';
  const result = spawnSync(
    process.execPath,
    [
      '--env-file-if-exists=.env',
      translateScript,
      '--dry-run',
      '--post',
      slug,
      '--locales',
      'en,fr',
    ],
    { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('=== en (English) ===');
  expect(result.stdout).toContain('=== fr (French) ===');
  expect(result.stdout).not.toContain('=== ja');
  expect(result.stdout).toContain(`posts/${slug}.md`);
  expect(result.stdout).not.toContain('pages/');
  expect(result.stdout).not.toContain('categories/');
  expect(result.stdout).not.toContain('i18n/en.json');
  expect(result.stdout).toContain(
    'Dry run. No API was called and no file was written.',
  );
});

it('rejects --post without a slug instead of falling back to all content', () => {
  const result = spawnSync(
    process.execPath,
    ['--env-file-if-exists=.env', translateScript, '--dry-run', '--post'],
    { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('--post requires a slug');
  expect(result.stdout).not.toContain('=== en (English) ===');
});

it('rejects --force for a post-scoped translation', () => {
  const slug =
    'neurologia-con-los-especialistas-de-venezuela-y-la-fundacion-rosario-gaton';
  const result = spawnSync(
    process.execPath,
    ['--env-file-if-exists=.env', translateScript, '--force', '--post', slug],
    { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('--force cannot be combined with --post');
});

it('rejects an unknown post before starting translation', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--env-file-if-exists=.env',
      translateScript,
      '--dry-run',
      '--post',
      'post-that-does-not-exist',
    ],
    { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    'Spanish source post "post-that-does-not-exist" was not found',
  );
  expect(result.stdout).not.toContain('=== en (English) ===');
});

it('rejects unknown locales in a scoped locale list', () => {
  const slug =
    'neurologia-con-los-especialistas-de-venezuela-y-la-fundacion-rosario-gaton';
  const result = spawnSync(
    process.execPath,
    [
      '--env-file-if-exists=.env',
      translateScript,
      '--dry-run',
      '--post',
      slug,
      '--locales',
      'en,xx',
    ],
    { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Unknown or missing locale "xx"');
  expect(result.stdout).not.toContain('=== en (English) ===');
});
