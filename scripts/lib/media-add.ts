/**
 * Pure helpers for `scripts/add-media.mts`.
 *
 * Uploading the photo of a new post is the one step the content pipeline does
 * not cover, so this module holds the decisions that must be deterministic and
 * testable: how the arguments are read, which folder a key belongs to, and how
 * the file is numbered inside it.
 *
 * The I/O (encode, upload, verify) lives in the script itself.
 */
import { baseNameOf, cleanEventSlug, descriptiveName } from './media-naming.ts';

export interface MediaAddOptions {
  /** Spanish post slug whose date and name define the folder. */
  post?: string;
  /** Explicit event folder (`YYYY-MM-DD-slug`) for media that has no post. */
  event?: string;
  /** Local files to encode and upload, in the order given. */
  files: string[];
  /** Alt text to reuse in the printed snippets. */
  alt?: string;
  /** Plan and encode, but upload nothing. */
  dryRun: boolean;
}

const POST_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EVENT_FOLDER_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Read the arguments of `npm run media:add`. */
export function parseMediaAddArgs(args: string[]): MediaAddOptions {
  let post: string | undefined;
  let event: string | undefined;
  let alt: string | undefined;
  let dryRun = false;
  const files: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (argument === '--post' || argument === '--event' || argument === '--alt') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value.`);
      }

      if (argument === '--post') {
        if (post !== undefined) throw new Error('--post may only be provided once.');
        post = value;
      } else if (argument === '--event') {
        if (event !== undefined) throw new Error('--event may only be provided once.');
        event = value;
      } else {
        if (alt !== undefined) throw new Error('--alt may only be provided once.');
        alt = value;
      }

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

  if (post === undefined && event === undefined) {
    throw new Error('Pass --post <slug> or --event <YYYY-MM-DD-slug>.');
  }
  if (post !== undefined && event !== undefined) {
    throw new Error('Pass either --post or --event, not both.');
  }
  if (post !== undefined && !POST_SLUG_PATTERN.test(post)) {
    throw new Error('--post must be a lowercase URL-safe slug.');
  }
  if (event !== undefined && !EVENT_FOLDER_PATTERN.test(event)) {
    throw new Error('--event must look like 2026-11-05-jornada-medica.');
  }
  if (files.length === 0) {
    throw new Error('Pass at least one --file.');
  }

  return { post, event, files, alt, dryRun };
}

/**
 * Guard a folder (not a key) before it is used as an object prefix.
 *
 * `isMediaPath` expects a file extension, so it cannot validate a folder.
 */
export function isSafeFolder(folder: string): boolean {
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
    segments.length >= 2 &&
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
