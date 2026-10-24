/**
 * Translate the site into the other languages.
 *
 * Spanish is the source language and lives in `src/content/es/`. This script
 * reads it and writes one copy per target locale:
 *
 *   src/content/es/…            →  src/content/<locale>/…
 *   src/i18n/es.json            →  src/i18n/<locale>.json
 *
 * The translation happens at build time, never in the browser: the visitor
 * gets a page that is already in their language, with the right `hreflang`
 * and the right `lang` attribute.
 *
 * Usage:
 *
 *   npm run translate                      # every missing locale
 *   npm run translate -- --locale fr       # one locale
 *   npm run translate -- --dry-run         # print the plan, call no API
 *   npm run translate -- --force           # translate again, overwriting
 *
 * Environment:
 *
 *   OPENAI_API_KEY      the key of the translation API (required)
 *   TRANSLATE_API_BASE  the base URL of the API (default: OpenAI)
 *   TRANSLATE_MODEL     the model to use (default: gpt-4o-mini)
 */
import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

import { markdownDocument } from './lib/yaml.ts';
import {
  applyTranslations,
  collectAllStrings,
  collectTranslatableStrings,
  mergeBaseWins,
  Translator,
} from './lib/translate.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src', 'content');
const i18nDir = join(root, 'src', 'i18n');

/** The language the content is written in. */
const SOURCE = 'es';

/** The languages the site is published in. */
const TARGETS = ['en', 'fr', 'ja', 'zh-TW'] as const;

type Target = (typeof TARGETS)[number];

/** The name of each language, for the prompt of the API. */
const LANGUAGE_NAMES: Record<Target, string> = {
  en: 'English',
  fr: 'French',
  ja: 'Japanese',
  'zh-TW': 'Traditional Chinese (Taiwan)',
};

/** The collections that are translated. */
const COLLECTIONS = [
  'pages',
  'posts',
  'categories',
  'tags',
  'programs',
  'team',
] as const;

type Collection = (typeof COLLECTIONS)[number];

/**
 * Posts published before this year are not translated.
 *
 * The archive of the foundation goes back to 2019 and is of little value in
 * four more languages; translating it would cost a lot and slow the launch
 * down. The evergreen pages are always translated.
 */
const POSTS_SINCE = '2025-01-01';

/* --- command line ------------------------------------------------------- */

const args = process.argv.slice(2);

const flag = (name: string): boolean => args.includes(`--${name}`);

const option = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;

  return args[index + 1];
};

const dryRun = flag('dry-run');
const force = flag('force');

const requested = option('locale');
const targets: Target[] = requested
  ? (TARGETS.filter((locale) => locale === requested) as Target[])
  : [...TARGETS];

if (requested && targets.length === 0) {
  console.error(`Unknown locale "${requested}". Available: ${TARGETS.join(', ')}.`);
  process.exit(1);
}

/* --- the API ------------------------------------------------------------ */

const apiKey = process.env.OPENAI_API_KEY ?? '';

const translator = new Translator({
  apiKey,
  baseUrl: process.env.TRANSLATE_API_BASE ?? 'https://api.openai.com/v1',
  model: process.env.TRANSLATE_MODEL ?? 'gpt-4o-mini',
  batchSize: Number(process.env.TRANSLATE_BATCH_SIZE ?? 25),
});

/* --- helpers ------------------------------------------------------------ */

interface Document {
  data: Record<string, unknown>;
  body: string;
}

/** Split a Markdown file into its frontmatter and its body. */
function parseDocument(source: string): Document {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);

  if (!match?.[1]) {
    throw new Error('The file has no frontmatter.');
  }

  const data = parseYaml(match[1]) as Record<string, unknown>;

  return { data, body: match[2] ?? '' };
}

/** Read an existing interface table, tolerating a missing or broken file. */
async function loadUiTable(
  file: string,
): Promise<Record<string, unknown> | undefined> {
  if (!existsSync(file)) return undefined;

  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    console.warn(`  warning: ${file} is not valid JSON and will be regenerated`);
    return undefined;
  }
}

/** Whether a non-empty value already exists at a `(string | number)[]` path. */
function hasPath(node: unknown, path: (string | number)[]): boolean {
  let current: unknown = node;

  for (const step of path) {
    if (current === undefined || current === null) return false;

    if (Array.isArray(current)) {
      current = current[step as number];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[String(step)];
    } else {
      return false;
    }
  }

  return current !== undefined && current !== null && current !== '';
}

/**
 * Split a Markdown body into chunks that can be translated one by one.
 *
 * The split happens on the empty lines, so a list or a table is never cut in
 * half.
 */
function chunkBody(body: string, maxLength = 3000): string[] {
  const paragraphs = body.split(/\n{2,}/).filter((part) => part.trim() !== '');

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (current !== '' && current.length + paragraph.length + 2 > maxLength) {
      chunks.push(current);
      current = paragraph;
      continue;
    }

    current = current === '' ? paragraph : `${current}\n\n${paragraph}`;
  }

  if (current !== '') chunks.push(current);

  return chunks;
}

/** Read every Markdown file of a collection of the source language. */
async function readCollection(collection: Collection): Promise<string[]> {
  const directory = join(contentDir, SOURCE, collection);
  if (!existsSync(directory)) return [];

  const files = await readdir(directory);

  return files.filter((file) => file.endsWith('.md')).sort();
}

/** The posts that are old enough to be skipped. */
function isOldPost(data: Record<string, unknown>): boolean {
  const date = data['date'];
  if (typeof date !== 'string') return false;

  return date.slice(0, 10) < POSTS_SINCE;
}

/* --- the run ------------------------------------------------------------ */

interface Summary {
  written: number;
  skipped: number;
  strings: number;
}

const summary: Record<Target, Summary> = {
  en: { written: 0, skipped: 0, strings: 0 },
  fr: { written: 0, skipped: 0, strings: 0 },
  ja: { written: 0, skipped: 0, strings: 0 },
  'zh-TW': { written: 0, skipped: 0, strings: 0 },
};

for (const target of targets) {
  const language = LANGUAGE_NAMES[target];
  console.log(`\n=== ${target} (${language}) ===`);

  const targetDir = join(contentDir, target);

  if (!dryRun && force) {
    // A forced run rebuilds the target locale from scratch.
    await rm(targetDir, { recursive: true, force: true });
  }

  for (const collection of COLLECTIONS) {
    const files = await readCollection(collection);

    for (const file of files) {
      const targetFile = join(targetDir, collection, file);

      // Without `--force` the existing translations are kept: a second run
      // only fills in what is missing.
      if (!dryRun && !force && existsSync(targetFile)) {
        summary[target].skipped += 1;
        continue;
      }

      const source = await readFile(join(contentDir, SOURCE, collection, file), 'utf8');

      const document = parseDocument(source);

      if (document.data['noAutoTranslate'] === true) {
        summary[target].skipped += 1;
        continue;
      }

      if (collection === 'posts' && isOldPost(document.data)) {
        summary[target].skipped += 1;
        continue;
      }

      const refs = collectTranslatableStrings(document.data);
      const bodyChunks = chunkBody(document.body);
      const strings = [...refs.map((ref) => ref.value), ...bodyChunks];

      if (strings.length === 0) {
        summary[target].skipped += 1;
        continue;
      }

      if (dryRun) {
        console.log(`  ${collection}/${file}: ${strings.length} strings`);
        summary[target].strings += strings.length;
        continue;
      }

      const translations = await translator.translate(language, strings);

      const translatedData = applyTranslations(
        { ...document.data, locale: target },
        refs,
        translations.slice(0, refs.length),
      );

      const translatedBody =
        translations.length > refs.length
          ? translations.slice(refs.length).join('\n\n')
          : '';

      await mkdir(dirname(targetFile), { recursive: true });
      await writeFile(
        targetFile,
        markdownDocument(translatedData, translatedBody),
        'utf8',
      );

      summary[target].written += 1;
      summary[target].strings += strings.length;
    }
  }

  /* --- the interface strings -------------------------------------------- */

  const sourceUi = JSON.parse(
    await readFile(join(i18nDir, `${SOURCE}.json`), 'utf8'),
  ) as Record<string, unknown>;

  const uiRefs = collectAllStrings(sourceUi);

  if (dryRun) {
    console.log(`  i18n/${target}.json: ${uiRefs.length} strings`);
    summary[target].strings += uiRefs.length;
    continue;
  }

  // Merge mode: an existing table only receives the keys it is missing, so
  // the manual polish of an already generated locale survives re-runs AND a
  // partial or empty table left behind by a crashed run gets completed.
  // `--force` regenerates the whole table on purpose.
  const uiFile = join(i18nDir, `${target}.json`);
  const base = await loadUiTable(uiFile);

  const pendingRefs = base
    ? uiRefs.filter((ref) => !hasPath(base, ref.path))
    : uiRefs;

  if (pendingRefs.length === 0) {
    console.log(`  i18n/${target}.json: complete (nothing to add)`);
    continue;
  }

  console.log(
    `  i18n/${target}.json: ${pendingRefs.length} missing strings` +
      (base ? ` (merging into an existing table)` : ''),
  );

  const uiTranslations = await translator.translate(
    language,
    pendingRefs.map((ref) => ref.value),
  );

  // Translate the missing keys over a fresh copy of the Spanish table and
  // then overlay whatever the existing table already held, so its manual
  // polish always wins and a partially filled file never loses a key.
  const regenerated = applyTranslations(
    structuredClone(sourceUi),
    pendingRefs,
    uiTranslations,
  ) as Record<string, unknown>;
  const translatedUi = base
    ? mergeBaseWins(regenerated, base)
    : regenerated;

  await mkdir(i18nDir, { recursive: true });
  await writeFile(
    uiFile,
    `${JSON.stringify(translatedUi, null, 2)}\n`,
    'utf8',
  );

  const total = collectAllStrings(translatedUi).length;

  console.log(`  i18n/${target}.json: ${total} strings`);
  summary[target].strings += pendingRefs.length;
}

if (dryRun) {
  console.log('\nDry run. No API was called and no file was written.');
} else {
  console.log('\nDone.');
}

for (const target of targets) {
  const { written, skipped, strings } = summary[target];
  console.log(
    `${target}: ${written} documents written, ${skipped} skipped, ${strings} strings translated.`,
  );
}

if (!dryRun && !apiKey) {
  console.warn(
    '\nOPENAI_API_KEY was empty — the run above only wrote what it could translate.',
  );
}
