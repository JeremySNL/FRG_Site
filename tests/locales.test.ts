/**
 * Regression gate for the generated locale content.
 *
 * `npm run translate` writes full mirrors of the Spanish content for every
 * locale. These checks pin the invariants that make those mirrors safe to
 * serve: same collection shape, identity fields untouched, and no string
 * silently left untranslated where a translation is expected.
 *
 * Intentionally NOT here: the post bodies of posts older than POSTS_SINCE
 * (the translator skips them by design) and documents flagged
 * `noAutoTranslate` in the Spanish source.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { expect, it } from 'vitest';

const root = process.cwd();
const contentDir = join(root, 'src', 'content');
const i18nDir = join(root, 'src', 'i18n');

const LOCALES = ['en', 'fr', 'ja', 'zh-TW'];
const COLLECTIONS = ['pages', 'posts', 'categories', 'tags', 'programs', 'team'];

/** Posts published before this year are not translated (translator rule). */
const POSTS_SINCE = '2025-01-01';

/**
 * Documents whose translated title may equal the Spanish source: the entity
 * proper noun and the person name of the own doctor are kept as is.
 */
const TITLE_EXCEPTIONS = new Set([
  'fundacion-rosario-gaton.md',
  // Branded proper names that stay as is in every locale.
  'interlatitudes-medicos.md',
  'dr-cruz-jiminian.md',
]);

/** Contact data that must survive every locale byte-identical. */
const CONTACT = ['(809) 290-2255', 'info@fundacionrosariogaton.org'];

interface Doc {
  data: Record<string, unknown>;
  body: string;
}

function parseDoc(source: string): Doc {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!match?.[1]) throw new Error(`no frontmatter: ${source.slice(0, 60)}`);
  return { data: parseYaml(match[1]) as Record<string, unknown>, body: match[2] ?? '' };
}

function listJson(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.md'));
}

it('generated locales mirror the Spanish content with their identity fields intact', () => {
  const defects: string[] = [];

  for (const locale of LOCALES) {
    const localeDir = join(contentDir, locale);

    if (!existsSync(localeDir)) {
      defects.push(`${locale}: content directory is missing entirely`);
      continue;
    }

    for (const collection of COLLECTIONS) {
      const sourceDir = join(contentDir, 'es', collection);
      if (!existsSync(sourceDir)) continue;

      for (const name of listJson(sourceDir)) {
        const source = parseDoc(
          readFileSync(join(contentDir, 'es', collection, name), 'utf8'),
        );

        if (source.data['noAutoTranslate'] === true) continue;
        if (
          collection === 'posts' &&
          String(source.data['date'] ?? '') < POSTS_SINCE
        ) {
          continue;
        }

        const target = join(contentDir, locale, collection, name);

        if (!existsSync(target)) {
          defects.push(`${locale}/${collection}/${name}: file is missing`);
          continue;
        }

        const generated = parseDoc(readFileSync(target, 'utf8'));

        if (generated.data['locale'] !== locale) {
          defects.push(`${locale}/${collection}/${name}: wrong locale "${generated.data['locale']}"`);
        }
        if (generated.data['slug'] !== source.data['slug']) {
          defects.push(`${locale}/${collection}/${name}: slug drifted`);
        }
        if ('legacyPath' in source.data && generated.data['legacyPath'] !== source.data['legacyPath']) {
          defects.push(`${locale}/${collection}/${name}: legacyPath drifted`);
        }
        if (collection === 'posts' && generated.data['date'] !== source.data['date']) {
          defects.push(`${locale}/posts/${name}: date drifted`);
        }
        if (
          collection === 'posts' &&
          JSON.stringify(generated.data['categories'] ?? null) !==
            JSON.stringify(source.data['categories'] ?? null)
        ) {
          defects.push(`${locale}/posts/${name}: categories drifted`);
        }
        if ('image' in source.data && generated.data['image'] !== source.data['image']) {
          defects.push(`${locale}/${collection}/${name}: image path drifted`);
        }

        if (
          ['pages', 'posts', 'categories', 'tags', 'programs'].includes(collection) &&
          !TITLE_EXCEPTIONS.has(name) &&
          generated.data['title'] === source.data['title']
        ) {
          defects.push(`${locale}/${collection}/${name}: title was not translated`);
        }

        if (
          collection === 'team' &&
          String(generated.data['role'] ?? '') !== '' &&
          generated.data['role'] === source.data['role']
        ) {
          defects.push(`${locale}/team/${name}: role was not translated`);
        }
      }
    }

    // The contact card data must be identical in every locale.
    const contactPages = ['donar', 'voluntariado'];
    for (const slug of contactPages) {
      const file = join(contentDir, locale, 'pages', `${slug}.md`);
      if (!existsSync(file)) continue;
      const raw = readFileSync(file, 'utf8');
      for (const value of CONTACT) {
        if (!raw.includes(value)) {
          defects.push(`${locale}/pages/${slug}.md: contact "${value}" was altered`);
        }
      }
    }
  }

  expect(defects, defects.join('\n')).toEqual([]);
});

/** Flatten an object into "dotted.path" string leaves. */
function flatten(value: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof value === 'object' && value !== null) {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      for (const [path, leaf] of flatten(inner, prefix ? `${prefix}.${key}` : key)) {
        out.set(path, leaf);
      }
    }
  } else {
    out.set(prefix, String(value));
  }
  return out;
}

it('every locale has a complete i18n table with no Spanish leftovers', () => {
  const defects: string[] = [];
  const source = flatten(
    JSON.parse(readFileSync(join(i18nDir, 'es.json'), 'utf8')),
  );

  for (const locale of LOCALES) {
    const file = join(i18nDir, `${locale}.json`);

    if (!existsSync(file)) {
      defects.push(`i18n/${locale}.json is missing`);
      continue;
    }

    const table = flatten(JSON.parse(readFileSync(file, 'utf8')));

    for (const [path, value] of source) {
      const translated = table.get(path);
      if (translated === undefined) {
        defects.push(`i18n/${locale}.json: missing key "${path}"`);
        continue;
      }
      if (translated === '' ) {
        defects.push(`i18n/${locale}.json: empty value at "${path}"`);
        continue;
      }
      if (translated === value) {
        defects.push(`i18n/${locale}.json: string "${path}" equals the Spanish source`);
      }
    }
  }

  expect(defects, defects.join('\n')).toEqual([]);
});
