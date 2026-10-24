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
