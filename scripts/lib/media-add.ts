/**
 * Pure helpers for `scripts/add-media.mts`.
 *
 * Uploading a photo is the one step the content pipeline does not cover, so
 * this module holds the decisions that must be deterministic and testable: how
 * the arguments are read, where a target lives in the bucket, and how a file is
 * numbered or versioned inside it.
 *
 * The I/O (encode, upload, verify) lives in the script itself.
 */
import { baseNameOf, cleanEventSlug, descriptiveName } from './media-naming.ts';

export interface MediaAddOptions {
  /** Spanish post slug whose date and name define the folder. */
  post?: string;
  /** Explicit event folder (`YYYY-MM-DD-slug`) for media that has no post. */
  event?: string;
  /** Page slug: `pages/<slug>/`. */
  page?: string;
  /** Program slug: the single fixed key `programs/<slug>/cover.webp`. */
  program?: string;
  /** Person slug: the single fixed key `team/<slug>.webp`. */
  team?: string;
  /** Any other folder inside the bucket, taken as written. */
  dir?: string;
  /** Local files to encode and upload, in the order given. */
  files: string[];
  /** Alt text to reuse in the printed snippets. */
  alt?: string;
  /** Plan and encode, but upload nothing. */
  dryRun: boolean;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EVENT_FOLDER_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const TARGET_FLAGS = ['--post', '--event', '--page', '--program', '--team', '--dir'];

/** Read the arguments of `npm run media:add`. */
export function parseMediaAddArgs(args: string[]): MediaAddOptions {
  const values = new Map<string, string>();
  let dryRun = false;
  const files: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (
      argument === '--alt' ||
      (argument !== undefined && TARGET_FLAGS.includes(argument))
    ) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value.`);
      }

      const key = argument === '--alt' ? '--alt' : argument;
      if (values.has(key)) throw new Error(`${key} may only be provided once.`);
      values.set(key, value);

      index += 1;
      continue;
    }

    if (argument === '--file') {
      // Consume every following value so `--file a.jpg b.jpg` works.
      let consumed = 0;
      while (index + 1 < args.length) {
        const value = args[index + 1];
        if (value === undefined || value.startsWith('--')) break;
        files.push(value);
        index += 1;
        consumed += 1;
      }
      if (consumed === 0) throw new Error('--file requires at least one path.');
      continue;
    }

    throw new Error(`Unknown option "${String(argument)}".`);
  }

  const provided = TARGET_FLAGS.filter((flag) => values.has(flag));
  if (provided.length === 0) {
    throw new Error(`Pass one of ${TARGET_FLAGS.join(', ')}.`);
  }
  if (provided.length > 1) {
    throw new Error(`Pass only one target, not ${provided.join(' + ')}.`);
  }

  const post = values.get('--post');
  const event = values.get('--event');
  const page = values.get('--page');
  const program = values.get('--program');
  const team = values.get('--team');
  const rawDir = values.get('--dir');

  for (const [flag, value] of [
    ['--post', post],
    ['--page', page],
    ['--program', program],
    ['--team', team],
  ] as const) {
    if (value !== undefined && !SLUG_PATTERN.test(value)) {
      throw new Error(`${flag} must be a lowercase URL-safe slug.`);
    }
  }

  if (event !== undefined && !EVENT_FOLDER_PATTERN.test(event)) {
    throw new Error('--event must look like 2026-11-05-jornada-medica.');
  }

  let dir: string | undefined;
  if (rawDir !== undefined) {
    dir = normalizeDir(rawDir);
    if (!isSafeFolder(dir, 1)) {
      throw new Error(`--dir must be a relative folder inside the bucket: ${rawDir}`);
    }
  }

  if (files.length === 0) {
    throw new Error('Pass at least one --file.');
  }

  // A fixed key holds one object, so several files have nowhere to go.
  if ((program !== undefined || team !== undefined) && files.length > 1) {
    throw new Error('--program and --team take a single --file.');
  }

  return {
    post,
    event,
    page,
    program,
    team,
    dir,
    files,
    alt: values.get('--alt'),
    dryRun,
  };
}

/** Strip the trailing slashes a user may type around a folder. */
export function normalizeDir(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/**
 * Guard a folder (not a key) before it is used as an object prefix.
 *
 * `isMediaPath` expects a file extension, so it cannot validate a folder.
 * `minimumSegments` defaults to two so a bare collection name (`photos`) is not
 * accepted as a folder; `--dir brand` is a legitimate one-segment target.
 */
export function isSafeFolder(folder: string, minimumSegments = 2): boolean {
  if (
    !folder ||
    folder.startsWith('/') ||
    folder.includes('\\') ||
    folder.includes(':')
  ) {
    return false;
  }

  const segments = folder.split('/');
  return (
    segments.length >= minimumSegments &&
    segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

/** The `YYYY-MM-DD` part of a frontmatter date, tolerating Date and string. */
export function isoDateOf(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    if (match?.[1]) return match[1];
  }
  return undefined;
}

/** The event folder of a post: `photos/<fecha>-<evento>`. */
export function mediaFolderFor(date: string, slug: string): string {
  const event = cleanEventSlug(slug);
  const name = event || cleanEventSlug('evento');
  return `photos/${date}-${name}`;
}

/** The folder of a page: `pages/<slug>`. */
export function pageFolder(slug: string): string {
  return `pages/${slug}`;
}

/** The single cover object of a program. */
export function programKey(slug: string): string {
  return `programs/${slug}/cover.webp`;
}

/** The single portrait of a team member. */
export function teamKey(slug: string): string {
  return `team/${slug}.webp`;
}

/**
 * The next free ordinal in a folder.
 *
 * Keys are numbered so a folder reads in order, and re-running the command for
 * the same folder must append instead of overwriting.
 */
export function nextOrdinal(keys: readonly string[]): number {
  let highest = 0;

  for (const key of keys) {
    const file = key.slice(key.lastIndexOf('/') + 1);
    const match = /^(\d+)(?:-|\.)/.exec(file);
    if (!match?.[1]) continue;
    highest = Math.max(highest, Number(match[1]));
  }

  return highest + 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The first free key for a single-asset target.
 *
 * Fixed keys are cached as immutable for a year, so replacing a cover must not
 * overwrite the existing object: the browser that already has it would keep the
 * old image. Instead the new photo gets the next version
 * (`cover.webp` -> `cover-2.webp` -> `cover-3.webp`) and the content reference
 * is updated to match.
 */
export function versionedKey(key: string, existing: readonly string[]): string {
  if (!existing.includes(key)) return key;

  const dot = key.lastIndexOf('.');
  const stem = dot < 0 ? key : key.slice(0, dot);
  const extension = dot < 0 ? '' : key.slice(dot);
  const base = stem.replace(/-\d+$/, '');

  let highest = 1;
  const pattern = new RegExp(`^${escapeRegExp(base)}-(\\d+)$`);

  for (const candidate of existing) {
    if (extension && !candidate.endsWith(extension)) continue;
    const candidateStem = extension ? candidate.slice(0, -extension.length) : candidate;
    const match = pattern.exec(candidateStem);
    if (match?.[1]) highest = Math.max(highest, Number(match[1]));
  }

  let version = highest + 1;
  while (existing.includes(`${base}-${version}${extension}`)) version += 1;

  return `${base}-${version}${extension}`;
}

export interface MediaTarget {
  file: string;
  key: string;
  ordinal: string;
}

/** Number and name each file inside the folder, keeping the input order. */
export function buildMediaTargets(
  folder: string,
  files: readonly string[],
  startOrdinal: number,
): MediaTarget[] {
  return files.map((file, index) => {
    const ordinal = String(startOrdinal + index).padStart(2, '0');
    // Windows paths reach this module too: normalise before taking the name.
    const descriptive = descriptiveName(baseNameOf(file.replace(/\\/g, '/')));
    const name = descriptive ? `${ordinal}-${descriptive}` : ordinal;

    return { file, key: `${folder}/${name}.webp`, ordinal };
  });
}
