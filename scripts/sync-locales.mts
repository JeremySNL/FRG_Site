/**
 * Bring the translated pages up to date with their Spanish source.
 *
 * `npm run translate` writes a translated copy once and then keeps it, so an
 * edit to a Spanish page (a new ambassador, a new photo, a reworded sentence)
 * never reaches the other languages on its own. This command finds, for each
 * copy, the Spanish version it was translated from — the Spanish file as it
 * was in the last commit that touched the copy — and rebuilds the copy from
 * the current Spanish page:
 *
 *   - a translation is kept when its Spanish text is unchanged, including any
 *     correction made by hand to the copy;
 *   - images, keys, numbers and every other untranslated value come from the
 *     current Spanish page;
 *   - only new or edited texts are sent to the translation API.
 *
 * Usage:
 *
 *   npm run sync:locales                       # preview: no API call, no write
 *   npm run sync:locales -- --write            # translate what is new and write
 *   npm run sync:locales -- --locale fr        # one locale
 *   npm run sync:locales -- --locales en,fr    # several locales
 *
 * A copy with uncommitted changes is skipped, because its source cannot be
 * told apart from those changes: commit (or discard) them and run it again.
 * Missing copies are left to `npm run translate`, which creates them.
 *
 * Environment (only needed by `--write` when something must be translated):
 *
 *   OPENAI_API_KEY      the key of the translation API
 *   TRANSLATE_API_BASE  the base URL of the API (default: OpenAI)
 *   TRANSLATE_MODEL     the model to use (default: gpt-4o-mini)
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  defaultLocale,
  translationLanguageNames,
  type TranslationLocale,
} from '../src/lib/locale-registry.ts';
import {
  completeLocaleSync,
  baselineFromHistory,
  deepEqual,
  parseMarkdownDocument,
  parseSyncArgs,
  planLocaleSync,
  stringsToTranslate,
  type MarkdownDocument,
  type SyncPlan,
} from './lib/locale-sync.ts';
import { isSkippedSource, Translator } from './lib/translate.ts';
import { markdownDocument } from './lib/yaml.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = 'src/content';

/** The collections `npm run translate` translates. */
const COLLECTIONS = [
  'pages',
  'posts',
  'categories',
  'tags',
  'programs',
  'team',
] as const;

/* --- command line --------------------------------------------------------- */

const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log(
    [
      'Usage: npm run sync:locales -- [--write] [--locale <l> | --locales <l1,l2>]',
      '',
      'Without --write it only shows what would change: no API call, no file written.',
    ].join('\n'),
  );
  process.exit(0);
}

const parsed = parseSyncArgs(args);

if ('error' in parsed) {
  console.error(parsed.error);
  process.exit(1);
}

const { write, locales: targets } = parsed;

/* --- git ------------------------------------------------------------------ */

function git(gitArgs: string[], input?: string): Buffer {
  const result = spawnSync('git', ['-c', 'core.quotePath=false', ...gitArgs], {
    cwd: root,
    input,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${gitArgs.join(' ')} failed: ${String(result.stderr)}`);
  }
  return result.stdout;
}

/** The commits that touched each file under `directory`, oldest first. */
function commitHistory(directory: string): Map<string, string[]> {
  const history = new Map<string, string[]>();
  let commit = '';

  for (const line of git(['log', '--format=%x00%H', '--name-only', '--', directory])
    .toString('utf8')
    .split('\n')) {
    const file = line.trim();
    if (line.startsWith('\0')) commit = line.slice(1).trim();
    else if (file) history.set(file, [commit, ...(history.get(file) ?? [])]);
  }

  return history;
}

/** Files under `directory` with uncommitted changes, untracked ones included. */
function changedFiles(directory: string): Set<string> {
  const files = new Set<string>();
  // With `-z`, a rename or copy (`R`/`C`) is followed by a bare field holding
  // the original path, without the two-letter status prefix.
  let originalPathFollows = false;

  for (const entry of git([
    'status',
    '--porcelain',
    '-z',
    '--untracked-files=all',
    '--',
    directory,
  ])
    .toString('utf8')
    .split('\0')) {
    if (originalPathFollows) {
      if (entry) files.add(entry);
      originalPathFollows = false;
    } else if (entry.length > 3) {
      files.add(entry.slice(3));
      originalPathFollows = entry[0] === 'R' || entry[0] === 'C';
    }
  }

  return files;
}

/** Read several `<commit>:<path>` blobs with a single git process. */
function readBlobs(requests: string[]): Map<string, string> {
  const blobs = new Map<string, string>();
  if (requests.length === 0) return blobs;

  const output = git(['cat-file', '--batch'], `${requests.join('\n')}\n`);
  let offset = 0;

  for (const request of requests) {
    const end = output.indexOf(0x0a, offset);
    const header = output.subarray(offset, end).toString('utf8');
    offset = end + 1;

    if (header.endsWith(' missing')) continue;

    const size = Number(header.split(' ')[2]);
    blobs.set(request, output.subarray(offset, offset + size).toString('utf8'));
    offset += size + 1;
  }

  return blobs;
}

/* --- the run -------------------------------------------------------------- */

interface Update {
  file: string;
  copy: MarkdownDocument;
  plan: SyncPlan;
}

const translator = new Translator({
  apiKey: process.env['OPENAI_API_KEY'] ?? '',
  baseUrl: process.env['TRANSLATE_API_BASE'] ?? 'https://api.openai.com/v1',
  model: process.env['TRANSLATE_MODEL'] ?? 'gpt-4o-mini',
  batchSize: Number(process.env['TRANSLATE_BATCH_SIZE'] ?? 25),
});

const plans = new Map<
  string,
  { updates: Update[]; current: number; skipped: string[]; missing: string[] }
>();

for (const locale of targets) {
  const commits = commitHistory(`${CONTENT}/${locale}`);
  const changed = changedFiles(`${CONTENT}/${locale}`);

  const updates: Update[] = [];
  const skipped: string[] = [];
  const missing: string[] = [];
  let current = 0;

  const candidates: Array<{
    file: string;
    copyPath: string;
    /** The Spanish file and the copy at each commit of the copy, oldest first. */
    history: Array<{ source: string; copy: string }>;
    source: string;
  }> = [];

  for (const collection of COLLECTIONS) {
    const sourceDir = join(root, CONTENT, defaultLocale, collection);
    if (!existsSync(sourceDir)) continue;

    for (const name of (await readdir(sourceDir))
      .filter((file) => file.endsWith('.md'))
      .sort()) {
      const file = `${collection}/${name}`;
      const sourcePath = `${CONTENT}/${defaultLocale}/${file}`;
      const copyPath = `${CONTENT}/${locale}/${file}`;
      const source = await readFile(join(root, sourcePath), 'utf8');

      if (isSkippedSource(parseMarkdownDocument(source).data, collection)) continue;

      if (!existsSync(join(root, copyPath))) {
        missing.push(file);
        continue;
      }

      const history = commits.get(copyPath);
      if (changed.has(copyPath) || !history) {
        skipped.push(file);
        continue;
      }

      candidates.push({
        file,
        copyPath,
        history: history.map((commit) => ({
          source: `${commit}:${sourcePath}`,
          copy: `${commit}:${copyPath}`,
        })),
        source,
      });
    }
  }

  const blobs = readBlobs(
    candidates.flatMap(({ history }) =>
      history.flatMap(({ source, copy }) => [source, copy]),
    ),
  );
  const parsed = (request: string): MarkdownDocument | undefined => {
    const blob = blobs.get(request);
    return blob === undefined ? undefined : parseMarkdownDocument(blob);
  };

  for (const { file, copyPath, history, source } of candidates) {
    const copy = parseMarkdownDocument(await readFile(join(root, copyPath), 'utf8'));
    const plan = planLocaleSync({
      current: parseMarkdownDocument(source),
      // The Spanish version the copy reflects, followed through its history.
      baseline: baselineFromHistory(
        history.map((commit) => ({
          source: parsed(commit.source),
          copy: parsed(commit.copy) ?? copy,
        })),
      ),
      copy,
      locale,
    });

    const untouched =
      stringsToTranslate(plan).length === 0 &&
      (() => {
        const result = completeLocaleSync(plan, []);
        return (
          deepEqual(result.data, copy.data) && result.body.trim() === copy.body.trim()
        );
      })();

    if (untouched) current += 1;
    else updates.push({ file, copy, plan });
  }

  plans.set(locale, { updates, current, skipped, missing });
}

/* --- report --------------------------------------------------------------- */

let pendingStrings = 0;

for (const [locale, { updates, current, skipped, missing }] of plans) {
  console.log(
    `\n=== ${locale} (${translationLanguageNames[locale as TranslationLocale]}) ===`,
  );

  for (const { file, plan } of updates) {
    const strings = stringsToTranslate(plan);
    pendingStrings += strings.length;

    console.log(
      `  ${file}: ${strings.length === 0 ? 'images and keys only' : `${strings.length} to translate`}, ${plan.reused} kept`,
    );
    for (const text of strings.slice(0, 5)) {
      const line = text.replace(/\s+/g, ' ');
      console.log(`      + ${line.length > 70 ? `${line.slice(0, 67)}...` : line}`);
    }
    if (strings.length > 5) console.log(`      … and ${strings.length - 5} more`);
  }

  console.log(`  up to date: ${current}`);
  if (skipped.length > 0) {
    console.log(`  skipped, uncommitted changes in the copy: ${skipped.join(', ')}`);
  }
  if (missing.length > 0) {
    console.log(`  missing (npm run translate creates them): ${missing.join(', ')}`);
  }
}

if (!write) {
  console.log(
    `\nPreview only: ${pendingStrings} strings would be translated. No API was called and no file was written. Run with --write to apply.`,
  );
  process.exit(0);
}

if (pendingStrings > 0 && !process.env['OPENAI_API_KEY']) {
  console.error(
    '\nOPENAI_API_KEY is missing. Set it in the ignored .env file; nothing was written.',
  );
  process.exit(1);
}

/* --- write ---------------------------------------------------------------- */

let written = 0;

for (const [locale, { updates }] of plans) {
  const language = translationLanguageNames[locale as TranslationLocale];

  for (const { file, plan } of updates) {
    const strings = stringsToTranslate(plan);
    const translations = await translator.translate(language, strings);
    const result = completeLocaleSync(plan, translations);

    await writeFile(
      join(root, CONTENT, locale, file),
      markdownDocument(result.data, result.body),
      'utf8',
    );
    written += 1;
    console.log(`  wrote ${locale}/${file}`);
  }
}

console.log(`\nDone: ${written} copies updated, ${pendingStrings} strings translated.`);
