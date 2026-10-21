import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The folder name of a document is the source of truth for its locale. The
 * `locale` key in the frontmatter has to match, or the content would be served
 * in the wrong language without any visible sign.
 */

/** Read the frontmatter of a Markdown file. */
function frontmatter(source: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!match?.[1]) return {};

  const data: Record<string, string> = {};

  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }

    data[key] = value;
  }

  return data;
}

async function collectFiles(directory: string): Promise<string[]> {
  if (!(await exists(directory))) return [];

  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }

      if (entry.name.endsWith('.md')) files.push(full);
    }
  }

  await walk(directory);
  return files;
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path, 'utf8');
    return true;
  } catch {
    // readdir is the real test
  }

  try {
    const { stat } = await import('node:fs/promises');
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe('the content', () => {
  it('has a locale in the frontmatter that matches its folder', async () => {
    const localesDir = join(root, 'src', 'content');
    const locales = await readdir(localesDir);

    for (const locale of locales) {
      const files = await collectFiles(join(localesDir, locale));

      for (const file of files) {
        const fm = frontmatter(await readFile(file, 'utf8'));
        expect(fm['locale'], `${file} is missing "locale"`).toBe(locale);
      }
    }
  });

  it('has a slug in every post, page and program', async () => {
    const paths = [
      join(root, 'src', 'content', 'es', 'pages'),
      join(root, 'src', 'content', 'es', 'posts'),
      join(root, 'src', 'content', 'es', 'programs'),
      join(root, 'src', 'content', 'es', 'categories'),
      join(root, 'src', 'content', 'es', 'tags'),
      join(root, 'src', 'content', 'es', 'team'),
    ];

    for (const directory of paths) {
      for (const file of await collectFiles(directory)) {
        const fm = frontmatter(await readFile(file, 'utf8'));
        expect(
          fm['slug'] !== undefined || fm['name'] !== undefined,
          `${file} is missing "slug"`,
        ).toBe(true);
      }
    }
  });

  it('uses trailing-slash paths for legacyPath', async () => {
    const files = await collectFiles(join(root, 'src', 'content'));

    for (const file of files) {
      const fm = frontmatter(await readFile(file, 'utf8'));
      const legacy = fm['legacyPath'];

      if (!legacy) continue;

      expect(legacy.startsWith('/'), `${file} legacyPath must start with /`).toBe(true);
      if (legacy !== '/') {
        expect(legacy.endsWith('/'), `${file} legacyPath must end with /`).toBe(true);
      }
    }
  });

  it('marks the ethics and donation pages as noAutoTranslate', async () => {
    const pages = await collectFiles(join(root, 'src', 'content', 'es', 'pages'));

    const targets = new Set([
      'politica-de-etica-y-seguridad.md',
      'donar.md',
      'voluntariado.md',
    ]);

    for (const file of pages) {
      if (!targets.has((file.split(/[\\\\/]/).pop()) ?? '')) continue;

      const fm = frontmatter(await readFile(file, 'utf8'));
      expect(fm['noAutoTranslate'], `${file} must not be translated`).toBe('true');
    }
  });
});

