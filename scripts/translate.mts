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
 * A plain re-run keeps every existing locale file and merges missing keys
 * into the interface tables; copies whose prose still equals the Spanish
 * source are treated as crashed-batch leftovers and regenerated. `--force`
 * rebuilds a locale from scratch but never deletes the locale copies of
 * documents the pipeline skips by rule (`noAutoTranslate`, pre-cutoff
 * posts), which are usually hand-written.
 *
 * Environment:
 *
 *   OPENAI_API_KEY      the key of the translation API (required)
 *   TRANSLATE_API_BASE  the base URL of the API (default: OpenAI)
 *   TRANSLATE_MODEL     the model to use (default: gpt-4o-mini)
 */
import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parse as parseYaml } from 'yaml';

import {
  defaultLocale,
  translationLanguageNames,
  translationLocales,
  type TranslationLocale,
} from '../src/lib/locale-registry.ts';
import { markdownDocument } from './lib/yaml.ts';
import {
  applyTranslations,
  collectAllStrings,
  collectTranslatableStrings,
  isIdentityProse,
  isSkippedSource,
  mergeBaseWins,
  Translator,
} from './lib/translate.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src', 'content');
const i18nDir = join(root, 'src', 'i18n');

/** The language the content is written in. */
const SOURCE = defaultLocale;

type Target = TranslationLocale;

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

/* --- command line ------------------------------------------------------- */

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const flag = (name: string): boolean => args.includes(`--${name}`);

  const option = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`);
    if (index === -1) return undefined;

    return args[index + 1];
  };

  const dryRun = flag('dry-run');
  const force = flag('force');
  const postSlug = option('post');
  const hasPostOption = args.includes('--post');

  const requested = option('locale');
  const requestedLocales = option('locales');
  const hasLocaleOption = args.includes('--locale');
  const hasLocalesOption = args.includes('--locales');

  if (hasPostOption && !postSlug) {
    console.error('--post requires a slug.');
    process.exit(1);
  }

  if (hasLocaleOption && !requested) {
    console.error('--locale requires a locale.');
    process.exit(1);
  }

  if (hasLocalesOption && !requestedLocales) {
    console.error('--locales requires a comma-separated locale list.');
    process.exit(1);
  }

  if (hasLocaleOption && hasLocalesOption) {
    console.error('Use either --locale or --locales, not both.');
    process.exit(1);
  }

  const selectedLocales = requestedLocales
    ? requestedLocales.split(',').map((locale) => locale.trim())
    : requested
      ? [requested]
      : [...translationLocales];
  const invalidLocales = selectedLocales.filter(
    (locale) => !translationLocales.includes(locale as Target),
  );
  const targets = translationLocales.filter((locale) =>
    selectedLocales.includes(locale),
  );

  if (invalidLocales.length > 0 || targets.length === 0) {
    console.error(
      `Unknown or missing locale${invalidLocales.length === 1 ? '' : 's'} "${invalidLocales.join(', ')}". Available: ${translationLocales.join(', ')}.`,
    );
    process.exit(1);
  }

  if (postSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(postSlug)) {
    console.error(`Invalid post slug "${postSlug}".`);
    process.exit(1);
  }

  if (postSlug && force) {
    console.error(
      '--force cannot be combined with --post; scoped runs never overwrite translations.',
    );
    process.exit(1);
  }

  if (postSlug && !existsSync(join(contentDir, SOURCE, 'posts', `${postSlug}.md`))) {
    console.error(`Spanish source post "${postSlug}" was not found.`);
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

    return files
      .filter(
        (file) =>
          file.endsWith('.md') &&
          (!postSlug || (collection === 'posts' && file === `${postSlug}.md`)),
      )
      .sort();
  }

  /**
   * Snapshot the locale copies whose Spanish source is skipped by rule —
   * hand-written `noAutoTranslate` documents and the pre-cutoff posts. They
   * have no regeneration path, so a forced wipe of the target locale must
   * not lose them: they are put back after the rebuild.
   */
  async function collectKeptCopies(targetDir: string): Promise<Map<string, string>> {
    const kept = new Map<string, string>();
    if (!existsSync(targetDir)) return kept;

    const entries = await readdir(targetDir, { withFileTypes: true, recursive: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

      const file = join(entry.parentPath, entry.name);
      const sourceFile = join(contentDir, SOURCE, relative(targetDir, file));

      if (!existsSync(sourceFile)) {
        // No Spanish source to regenerate it from — never lose it.
        kept.set(file, await readFile(file, 'utf8'));
        continue;
      }

      const document = parseDocument(await readFile(sourceFile, 'utf8'));
      const collection = dirname(relative(targetDir, file)).split(/[\\/]/)[0] ?? null;

      if (isSkippedSource(document.data, collection)) {
        kept.set(file, await readFile(file, 'utf8'));
      }
    }

    return kept;
  }

  /**
   * Whether an existing locale copy is an untranslated fingerprint of a
   * crashed batch: its prose is still the Spanish source and the source
   * itself is not skipped by rule (an untranslated copy of a skipped
   * document is correct, not broken).
   */
  async function isIdentityCopy(
    targetFile: string,
    sourceFile: string,
    collection: Collection,
  ): Promise<boolean> {
    if (!existsSync(sourceFile)) return false;

    let source: Document;
    let target: Document;

    try {
      source = parseDocument(await readFile(sourceFile, 'utf8'));
      target = parseDocument(await readFile(targetFile, 'utf8'));
    } catch {
      // A copy that cannot even be parsed is not a finished translation,
      // but mangling it silently is worse than leaving it to be repaired
      // on purpose.
      return false;
    }

    if (isSkippedSource(source.data, collection)) return false;

    return isIdentityProse(source.body, target.body);
  }

  /* --- the run ------------------------------------------------------------ */

  interface Summary {
    written: number;
    skipped: number;
    strings: number;
  }

  const summary = Object.fromEntries(
    translationLocales.map((target) => [
      target,
      { written: 0, skipped: 0, strings: 0 },
    ]),
  ) as Record<Target, Summary>;

  for (const target of targets) {
    const language = translationLanguageNames[target];
    console.log(`\n=== ${target} (${language}) ===`);

    const targetDir = join(contentDir, target);

    if (!dryRun && force && !postSlug) {
      // A forced run rebuilds the target locale from scratch, but the copies
      // of documents the pipeline skips by source rule have no regeneration
      // path: they are either hand-written (`noAutoTranslate`) or the
      // deliberate pre-cutoff archive, so they are stashed around the wipe
      // and put back after it.
      const keptCopies = await collectKeptCopies(targetDir);

      await rm(targetDir, { recursive: true, force: true });

      for (const [file, content] of keptCopies) {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, content, 'utf8');
      }
    }

    const collections: readonly Collection[] = postSlug ? ['posts'] : COLLECTIONS;
    for (const collection of collections) {
      const files = await readCollection(collection);

      for (const file of files) {
        const targetFile = join(targetDir, collection, file);

        // Without `--force` the existing translations are kept: a second run
        // only fills in what is missing. A copy whose prose still equals the
        // Spanish source is not a translation but the fingerprint of a
        // crashed batch, so it is treated as missing and regenerated.
        if (!dryRun && !force && existsSync(targetFile)) {
          if (
            !(await isIdentityCopy(
              targetFile,
              join(contentDir, SOURCE, collection, file),
              collection,
            ))
          ) {
            summary[target].skipped += 1;
            continue;
          }

          console.log(
            `  ${collection}/${file}: still equals the Spanish source, regenerating`,
          );
        }

        const source = await readFile(
          join(contentDir, SOURCE, collection, file),
          'utf8',
        );

        const document = parseDocument(source);

        if (isSkippedSource(document.data, collection)) {
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

    if (postSlug) continue;

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
    const translatedUi = base ? mergeBaseWins(regenerated, base) : regenerated;

    await mkdir(i18nDir, { recursive: true });
    await writeFile(uiFile, `${JSON.stringify(translatedUi, null, 2)}\n`, 'utf8');

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
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  await main();
}
