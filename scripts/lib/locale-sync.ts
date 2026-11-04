/**
 * Pure helpers for `scripts/sync-locales.mts`.
 *
 * A translated document is generated once from the Spanish source and then
 * kept, so later edits to the Spanish page never reach it on their own. This
 * module rebuilds a translated copy from the current Spanish document while
 * keeping every translation that is still valid.
 *
 * The rule that makes it safe: a translation is reused only when the Spanish
 * text it was made from is still exactly the same, at the same place. The
 * "baseline" is the Spanish document the copy was translated from (the
 * caller reads it from git); since the translator writes the copy with the
 * same structure as its source, the baseline and the copy line up path by
 * path. Everything else — a new item, an edited sentence — is sent to the
 * translator, and every value that is not translated (images, keys, numbers)
 * comes from the current Spanish document.
 */
import { parse as parseYaml } from 'yaml';

import {
  translationLocales,
  type TranslationLocale,
} from '../../src/lib/locale-registry.ts';
import {
  applyTranslations,
  collectTranslatableStrings,
  localizeLinks,
  type StringRef,
} from './translate.ts';

export type Path = (string | number)[];

export interface MarkdownDocument {
  data: Record<string, unknown>;
  body: string;
}

/** The text with Windows line endings turned into the `\n` git stores. */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * Split a Markdown file into its frontmatter and its body.
 *
 * A file edited on Windows can sit in the working tree with `\r\n` while git
 * stores `\n`; both are the same document, so the line endings are normalized
 * first and the paragraphs of the two compare equal.
 */
export function parseMarkdownDocument(source: string): MarkdownDocument {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalizeLineEndings(source));

  if (!match?.[1]) {
    throw new Error('The file has no frontmatter.');
  }

  return {
    data: parseYaml(match[1]) as Record<string, unknown>,
    body: match[2] ?? '',
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (Array.isArray(a)) {
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => deepEqual(item, b[index]))
    );
  }

  if (isPlainObject(a)) {
    if (!isPlainObject(b)) return false;
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => key in b && deepEqual(a[key], b[key]))
    );
  }

  return false;
}

function getAtPath(node: unknown, path: Path): unknown {
  let current = node;

  for (const step of path) {
    if (Array.isArray(current)) current = current[step as number];
    else if (isPlainObject(current)) current = current[String(step)];
    else return undefined;
  }

  return current;
}

const pathKey = (path: Path): string => JSON.stringify(path);

/** How many plain values two objects share — a hint that they are the same item. */
function likeness(a: Record<string, unknown>, b: Record<string, unknown>): number {
  let score = 0;
  for (const [key, value] of Object.entries(a)) {
    if (typeof value !== 'object' && value === b[key]) score += 1;
  }
  return score;
}

/** Pair each item of `current` with the item of `baseline` it most likely is. */
function pairItems(current: unknown[], baseline: unknown[]): Array<number | undefined> {
  const pairs: Array<number | undefined> = current.map(() => undefined);
  const used = new Set<number>();
  const take = (index: number, baseIndex: number): void => {
    pairs[index] = baseIndex;
    used.add(baseIndex);
  };

  // Untouched items, in place first and then moved (a reordered list).
  current.forEach((item, index) => {
    if (index < baseline.length && deepEqual(item, baseline[index])) take(index, index);
  });
  current.forEach((item, index) => {
    if (pairs[index] !== undefined) return;
    const found = baseline.findIndex(
      (base, at) => !used.has(at) && deepEqual(item, base),
    );
    if (found >= 0) take(index, found);
  });

  // Edited objects: the remaining item that shares the most plain values,
  // the nearest one on a tie. Strings that differ are never reused anyway.
  current.forEach((item, index) => {
    if (pairs[index] !== undefined || !isPlainObject(item)) return;

    let best: number | undefined;
    let bestScore = 0;
    baseline.forEach((base, at) => {
      if (used.has(at) || !isPlainObject(base)) return;
      const score = likeness(item, base);
      const closer =
        best !== undefined && Math.abs(at - index) < Math.abs(best - index);
      if (score > bestScore || (score === bestScore && score > 0 && closer)) {
        best = at;
        bestScore = score;
      }
    });

    if (best !== undefined) take(index, best);
  });

  return pairs;
}

const isLeaf = (value: unknown): boolean => value === null || typeof value !== 'object';

/**
 * Map every plain value (string, number, boolean) of `current` that is
 * unchanged since `baseline` to the path it had in `baseline`. Moved,
 * reordered or partly edited items keep their unchanged values; new or edited
 * values are left out of the map.
 */
export function mapUnchangedValues(
  current: unknown,
  baseline: unknown,
): Map<string, Path> {
  const result = new Map<string, Path>();

  const walk = (cur: unknown, base: unknown, curPath: Path, basePath: Path): void => {
    if (isLeaf(cur)) {
      if (cur === base) result.set(pathKey(curPath), basePath);
      return;
    }

    if (Array.isArray(cur)) {
      if (!Array.isArray(base)) return;
      pairItems(cur, base).forEach((baseIndex, index) => {
        if (baseIndex !== undefined) {
          walk(
            cur[index],
            base[baseIndex],
            [...curPath, index],
            [...basePath, baseIndex],
          );
        }
      });
      return;
    }

    if (isPlainObject(cur) && isPlainObject(base)) {
      for (const key of Object.keys(cur)) {
        if (key in base)
          walk(cur[key], base[key], [...curPath, key], [...basePath, key]);
      }
    }
  };

  walk(current, baseline, [], []);
  return result;
}

/** The paragraphs of a Markdown body, split on the empty lines. */
export function splitParagraphs(body: string): string[] {
  return body.split(/\n{2,}/).filter((part) => part.trim() !== '');
}

export interface SyncPlan {
  /** The current Spanish frontmatter with every reusable translation in place. */
  data: Record<string, unknown>;
  /** Frontmatter strings that still need a translation (Spanish values). */
  pending: StringRef[];
  /** The body, paragraph by paragraph; `translate` marks the Spanish ones. */
  paragraphs: Array<{ text: string; translate: boolean }>;
  /** The translated body to keep as it is, when the Spanish body did not change. */
  keptBody?: string;
  /** How many translations were carried over. */
  reused: number;
}

/** Every plain value of a document, with its path. */
function forEachLeaf(
  node: unknown,
  visit: (path: Path, value: unknown) => void,
  path: Path = [],
): void {
  if (isLeaf(node)) {
    visit(path, node);
  } else if (Array.isArray(node)) {
    node.forEach((item, index) => forEachLeaf(item, visit, [...path, index]));
  } else if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node))
      forEachLeaf(value, visit, [...path, key]);
  }
}

function setLeaf(node: unknown, path: Path, value: unknown): void {
  const parent = getAtPath(node, path.slice(0, -1));
  const last = path[path.length - 1];
  if (last === undefined) return;

  if (Array.isArray(parent)) parent[last as number] = value;
  else if (isPlainObject(parent)) parent[String(last)] = value;
}

/**
 * Plan how to bring a translated copy up to date with the Spanish document.
 *
 * It is a three-way merge, value by value. When the Spanish value is the one
 * the copy was made from, the copy's value wins: a translation, a localized
 * link (`/en/donar/`) or a correction made by hand. When the Spanish value is
 * new or changed, the Spanish one wins, and it is sent to the translator when
 * it is reader-facing text.
 *
 * Without a baseline (the copy's source is unknown) nothing can be proven
 * unchanged, so every string is planned for translation.
 */
export function planLocaleSync(input: {
  current: MarkdownDocument;
  baseline: MarkdownDocument | undefined;
  copy: MarkdownDocument;
  locale: TranslationLocale;
  /**
   * Spanish texts, by path, whose translation was already found identical to
   * the copy (see {@link unchangedTranslations}). Git cannot record them,
   * since the file did not change, so they would be flagged forever.
   */
  acknowledged?: ReadonlyMap<string, string>;
}): SyncPlan {
  const { current, baseline, copy, locale, acknowledged } = input;

  const translatable = new Set(
    collectTranslatableStrings(current.data).map((ref) => pathKey(ref.path)),
  );
  const unchanged = baseline
    ? mapUnchangedValues(current.data, baseline.data)
    : new Map<string, Path>();

  const data = structuredClone(current.data);
  const pending: StringRef[] = [];
  let reusedValues = 0;

  forEachLeaf(current.data, (path, value) => {
    const key = pathKey(path);
    const basePath = unchanged.get(key);
    const kept = basePath ? getAtPath(copy.data, basePath) : undefined;
    const isText = translatable.has(key);

    if (isText) {
      if (typeof kept === 'string' && kept.trim() !== '') {
        setLeaf(data, path, kept);
        reusedValues += 1;
      } else {
        const own = getAtPath(copy.data, path);
        if (
          acknowledged?.get(key) === value &&
          typeof own === 'string' &&
          own.trim() !== ''
        ) {
          setLeaf(data, path, own);
          reusedValues += 1;
        } else {
          pending.push({ path, value: value as string });
        }
      }
    } else if (kept !== undefined && isLeaf(kept)) {
      // Unchanged in Spanish: keep what the copy holds (a localized link…).
      setLeaf(data, path, kept);
    }
    // Otherwise the value is new or changed in Spanish, which already holds it.
  });

  data['locale'] = locale;

  let paragraphs: SyncPlan['paragraphs'] = [];
  let keptBody: string | undefined;
  let reusedParagraphs = 0;

  if (baseline && current.body === baseline.body) {
    keptBody = copy.body;
  } else {
    const currentParagraphs = splitParagraphs(current.body);
    const baseParagraphs = splitParagraphs(baseline?.body ?? '');
    const copyParagraphs = splitParagraphs(copy.body);

    // Paragraphs line up only while the copy kept the paragraph count of its
    // source; otherwise the whole body is translated again.
    const aligned =
      baseline !== undefined && baseParagraphs.length === copyParagraphs.length;
    const unchangedParagraphs = aligned
      ? mapUnchangedValues(currentParagraphs, baseParagraphs)
      : new Map<string, Path>();

    paragraphs = currentParagraphs.map((text, index) => {
      const basePath = unchangedParagraphs.get(pathKey([index]));
      const translated = basePath ? copyParagraphs[basePath[0] as number] : undefined;

      if (translated !== undefined) {
        reusedParagraphs += 1;
        return { text: translated, translate: false };
      }
      return { text, translate: true };
    });
  }

  return {
    // Unchanged links keep the copy's value; new ones get the locale prefix.
    data: localizeLinks(data, locale),
    pending,
    paragraphs,
    keptBody,
    reused: reusedValues + reusedParagraphs,
  };
}

/** The Spanish strings a plan sends to the translator, in the order expected back. */
/**
 * The frontmatter strings whose new translation is exactly what the copy
 * already holds (a gender-neutral title, a proper noun). Writing them changes
 * nothing in the file, so the caller records them as acknowledged.
 */
export function unchangedTranslations(
  plan: SyncPlan,
  copy: MarkdownDocument,
  translations: readonly string[],
): Array<{ path: string; source: string }> {
  return plan.pending.flatMap((ref, index) =>
    translations[index] !== undefined &&
    translations[index] === getAtPath(copy.data, ref.path)
      ? [{ path: pathKey(ref.path), source: ref.value }]
      : [],
  );
}

export function stringsToTranslate(plan: SyncPlan): string[] {
  return [
    ...plan.pending.map((ref) => ref.value),
    ...plan.paragraphs.filter((part) => part.translate).map((part) => part.text),
  ];
}

/** Put the translations of `stringsToTranslate(plan)` back into the document. */
export function completeLocaleSync(
  plan: SyncPlan,
  translations: readonly string[],
): MarkdownDocument {
  const data = applyTranslations(
    plan.data,
    plan.pending,
    translations.slice(0, plan.pending.length),
  );

  if (plan.keptBody !== undefined) return { data, body: plan.keptBody };

  let next = plan.pending.length;
  const body = plan.paragraphs
    .map((part) => {
      if (!part.translate) return part.text;
      const translated = translations[next];
      next += 1;
      return translated && translated.trim() !== '' ? translated : part.text;
    })
    .join('\n\n');

  return { data, body };
}

/** A document as one tree: the frontmatter and the paragraphs of the body. */
interface DocumentTree {
  data: Record<string, unknown>;
  paragraphs: string[];
}

const treeOf = (document: MarkdownDocument): DocumentTree => ({
  data: document.data,
  paragraphs: splitParagraphs(document.body),
});

/** The structure of a value: keys and list lengths, without the values. */
function shapeOf(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(shapeOf);
  if (isPlainObject(node)) {
    return Object.fromEntries(
      Object.keys(node)
        .sort()
        .map((key) => [key, shapeOf(node[key])]),
    );
  }
  return 0;
}

const sameShape = (a: unknown, b: unknown): boolean =>
  deepEqual(shapeOf(a), shapeOf(b));

/** Rebuild a document from a tree, reusing an original body when it matches. */
function documentOf(
  tree: DocumentTree,
  ...originals: MarkdownDocument[]
): MarkdownDocument {
  const original = originals.find((document) =>
    deepEqual(splitParagraphs(document.body), tree.paragraphs),
  );
  return { data: tree.data, body: original?.body ?? tree.paragraphs.join('\n\n') };
}

/**
 * The Spanish version a copy actually reflects, when the commit that last
 * touched the copy also touched its Spanish source.
 *
 * By default that commit's Spanish file is the baseline. That is wrong when
 * the commit changed the Spanish text and the copy only got an unrelated hand
 * fix: the Spanish change would look already translated forever. So, when the
 * structure did not change, the baseline takes, value by value, the Spanish
 * text of the commit where the copy changed too (it was handled, by hand or by
 * `sync:locales`) and the previous Spanish text where it did not (so the edit
 * is sent to the translator). When the structure changed, the copy tells which
 * Spanish version it follows. With no previous version, the commit's Spanish
 * file is the baseline, as before.
 */
export function effectiveBaseline(input: {
  /** The Spanish version the copy reflected before the commit. */
  sourceBefore: MarkdownDocument | undefined;
  /** The Spanish file at the commit. */
  source: MarkdownDocument;
  /** The copy before the commit. */
  copyBefore: MarkdownDocument | undefined;
  /** The copy at the commit. */
  copy: MarkdownDocument;
}): MarkdownDocument {
  const { sourceBefore, source, copyBefore, copy } = input;
  if (!sourceBefore || !copyBefore) return source;

  const before = treeOf(sourceBefore);
  const after = treeOf(source);
  if (deepEqual(before, after)) return source;

  const copyThen = treeOf(copyBefore);
  const copyNow = treeOf(copy);

  if (
    sameShape(before, after) &&
    sameShape(copyThen, before) &&
    sameShape(copyNow, after)
  ) {
    const merged = structuredClone(after);
    forEachLeaf(after, (path, value) => {
      const handled = getAtPath(copyNow, path) !== getAtPath(copyThen, path);
      setLeaf(merged, path, handled ? value : getAtPath(before, path));
    });
    return documentOf(merged, source, sourceBefore);
  }

  if (sameShape(copyNow, after)) return source;
  if (sameShape(copyNow, before)) return sourceBefore;
  return source;
}

/**
 * The Spanish version a copy reflects today, followed through every commit
 * that touched the copy, oldest first.
 *
 * A copy starts as the translation of the Spanish page of its first commit.
 * At each later commit, a value the copy changed is taken as following the
 * Spanish page of that commit, and a value it did not change keeps the Spanish
 * text it reflected before. So a copy that fell behind stays behind, even when
 * a later commit only fixes something else in it by hand.
 */
export function baselineFromHistory(
  history: ReadonlyArray<{
    source: MarkdownDocument | undefined;
    copy: MarkdownDocument;
  }>,
): MarkdownDocument | undefined {
  const [first, ...later] = history;
  if (!first) return undefined;

  let reflected = first.source;
  let previousCopy = first.copy;

  for (const { source, copy } of later) {
    if (reflected && source) {
      reflected = effectiveBaseline({
        sourceBefore: reflected,
        source,
        copyBefore: previousCopy,
        copy,
      });
    }
    previousCopy = copy;
  }

  return reflected;
}

export type SyncArgs =
  { write: boolean; locales: TranslationLocale[] } | { error: string };

/**
 * Read the command line of `sync:locales`.
 *
 * A locale option without its value is an error, never "every locale": with
 * `--write` that would spend translation calls and rewrite four languages
 * instead of one. The messages match `npm run translate`.
 */
export function parseSyncArgs(args: readonly string[]): SyncArgs {
  const valueOf = (name: string): string | undefined | null => {
    const index = args.indexOf(name);
    if (index === -1) return null;
    const value = args[index + 1];
    return value === undefined || value.startsWith('--') ? undefined : value;
  };

  const locale = valueOf('--locale');
  const list = valueOf('--locales');

  if (locale === undefined) return { error: '--locale requires a locale.' };
  if (list === undefined) {
    return { error: '--locales requires a comma-separated locale list.' };
  }
  if (locale !== null && list !== null) {
    return { error: 'Use either --locale or --locales, not both.' };
  }

  const values = new Set(
    [locale, list].filter((value): value is string => value !== null),
  );
  for (const arg of args) {
    if (arg.startsWith('--')) {
      if (!['--write', '--locale', '--locales'].includes(arg)) {
        return { error: `Unknown option ${arg}. Run with --help.` };
      }
    } else if (!values.has(arg)) {
      return { error: `Unexpected argument "${arg}". Run with --help.` };
    }
  }

  const requested =
    list?.split(',').map((value) => value.trim()) ??
    (locale ? [locale] : [...translationLocales]);
  const unknown = requested.filter(
    (value) => !translationLocales.includes(value as TranslationLocale),
  );
  if (unknown.length > 0 || requested.length === 0) {
    return {
      error: `Unknown locale "${unknown.join(', ')}". Available: ${translationLocales.join(', ')}.`,
    };
  }

  return { write: args.includes('--write'), locales: requested as TranslationLocale[] };
}
