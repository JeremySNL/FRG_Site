import {
  translationLocales,
  type TranslationLocale,
} from '../../src/lib/locale-registry.ts';

export interface PostReadyOptions {
  slug: string;
  locales: TranslationLocale[];
  dryRun: boolean;
}

const POST_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Parse and validate the arguments accepted by the post preparation command. */
export function parsePostReadyArgs(args: string[]): PostReadyOptions {
  let slug: string | undefined;
  let requestedLocales: string | undefined;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (argument !== '--slug' && argument !== '--locales') {
      throw new Error(`Unknown option "${argument}".`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${argument} requires a value.`);
    }

    if (argument === '--slug') {
      if (slug !== undefined) throw new Error('--slug may only be provided once.');
      slug = value;
    } else {
      if (requestedLocales !== undefined) {
        throw new Error('--locales may only be provided once.');
      }
      requestedLocales = value;
    }

    index += 1;
  }

  if (!slug) throw new Error('--slug is required.');
  if (!POST_SLUG_PATTERN.test(slug)) {
    throw new Error('--slug must be a lowercase URL-safe slug.');
  }

  const locales = requestedLocales
    ? requestedLocales.split(',').map((locale) => locale.trim())
    : [...translationLocales];

  if (locales.some((locale) => locale === '')) {
    throw new Error('--locales must be a comma-separated list of locale codes.');
  }

  const unknownLocales = locales.filter(
    (locale) => !translationLocales.includes(locale as TranslationLocale),
  );
  if (unknownLocales.length > 0) {
    throw new Error(
      `Unknown locale "${unknownLocales.join(', ')}". Available: ${translationLocales.join(', ')}.`,
    );
  }

  return {
    slug,
    locales: [...new Set(locales as TranslationLocale[])],
    dryRun,
  };
}

/** Build the safe, post-scoped arguments for the existing translator CLI. */
export function translationArgsForPostReady(options: PostReadyOptions): string[] {
  return [
    '--post',
    options.slug,
    '--locales',
    options.locales.join(','),
    ...(options.dryRun ? ['--dry-run'] : []),
  ];
}
