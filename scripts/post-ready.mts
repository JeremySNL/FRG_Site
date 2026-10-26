import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';

import { localePath } from '../src/lib/locales.ts';
import { isSkippedSource } from './lib/translate.ts';
import { parsePostReadyArgs, translationArgsForPostReady } from './lib/post-ready.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const translateScript = join(root, 'scripts', 'translate.mts');
const sourcePostsDir = join(root, 'src', 'content', 'es', 'posts');

function runNpm(args: string[]): void {
  const npmCli = process.env['npm_execpath'];
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, ...args], {
        cwd: root,
        stdio: 'inherit',
      })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
        cwd: root,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `npm ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}.`,
    );
  }
}

function runTranslation(args: string[]): void {
  const result = spawnSync(
    process.execPath,
    ['--env-file-if-exists=.env', translateScript, ...args],
    { cwd: root, stdio: 'inherit', env: process.env },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `The scoped translation command failed with exit code ${result.status ?? 'unknown'}.`,
    );
  }
}

function frontmatterOf(source: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match?.[1]) throw new Error('The post has no YAML frontmatter.');

  const parsed: unknown = parseYaml(match[1]);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The post frontmatter must be a YAML object.');
  }

  return parsed as Record<string, unknown>;
}

function validateTaxonomy(field: 'categories' | 'tags', values: unknown): void {
  if (values === undefined) return;
  if (!Array.isArray(values)) {
    throw new Error(`Frontmatter "${field}" must be an array of existing slugs.`);
  }

  const directory = join(root, 'src', 'content', 'es', field);
  const unknown = values.filter(
    (value) => typeof value !== 'string' || !existsSync(join(directory, `${value}.md`)),
  );

  if (unknown.length > 0) {
    throw new Error(
      `Unknown ${field} slug(s): ${unknown.map(String).join(', ')}. Use existing Spanish ${field} files.`,
    );
  }
}

function printUsage(): void {
  console.log(
    [
      'Usage: npm run post:ready -- --slug <post-slug> [--locales en,fr,ja,zh-TW] [--dry-run]',
      '',
      'Prepare one Spanish source post: translate only that post, run quality checks, and build a local preview.',
      'Images must be uploaded separately. This command never uploads media, commits, pushes, or deploys.',
    ].join('\n'),
  );
}

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  if (args.includes('--help')) {
    printUsage();
    return;
  }

  const options = parsePostReadyArgs(args);

  const sourcePath = join(sourcePostsDir, `${options.slug}.md`);
  if (!existsSync(sourcePath)) {
    throw new Error(
      `Spanish source post was not found: src/content/es/posts/${options.slug}.md`,
    );
  }

  const source = await readFile(sourcePath, 'utf8');
  const frontmatter = frontmatterOf(source);
  if (frontmatter['slug'] !== options.slug) {
    throw new Error(`Frontmatter slug must match the filename slug "${options.slug}".`);
  }
  if (frontmatter['locale'] !== 'es') {
    throw new Error('The source post must set locale: "es".');
  }

  validateTaxonomy('categories', frontmatter['categories']);
  validateTaxonomy('tags', frontmatter['tags']);
  console.log(
    '\nImages must be uploaded separately. This command does not upload or verify R2 objects.',
  );

  const skippedBySourceRule = isSkippedSource(frontmatter, 'posts');
  console.log(
    `\nPost: ${String(frontmatter['title'] ?? options.slug)} (${options.slug})`,
  );
  console.log(`Locales: ${options.locales.join(', ')}`);

  if (!options.dryRun && !skippedBySourceRule && !process.env['OPENAI_API_KEY']) {
    throw new Error(
      'OPENAI_API_KEY is missing. Set it in the ignored .env file before generating translations.',
    );
  }

  if (!options.dryRun) {
    console.log('\n→ Validating source content');
    runNpm(['run', 'check']);
  }

  if (skippedBySourceRule) {
    console.log(
      '\nAutomatic translation is disabled for this post by its source metadata/date.',
    );
  } else {
    console.log(`\n→ ${options.dryRun ? 'Previewing' : 'Translating'} this post only`);
    runTranslation(translationArgsForPostReady(options));
  }

  if (options.dryRun) {
    console.log(
      '\nDry run complete. No translation API call, file write, test, build, or deployment occurred.',
    );
    return;
  }

  const qualityChecks: Array<{ label: string; args: string[] }> = [
    { label: 'TypeScript typecheck', args: ['run', 'typecheck'] },
    { label: 'Lint', args: ['run', 'lint'] },
    {
      label: 'Test suite',
      args: ['run', 'test', '--', '--test-timeout=30000'],
    },
    { label: 'Production build', args: ['run', 'build'] },
  ];

  for (const check of qualityChecks) {
    console.log(`\n→ ${check.label}`);
    runNpm(check.args);
  }

  const previewRoutes = options.locales.map((locale) =>
    localePath(locale, `actualidades/${options.slug}`),
  );
  console.log('\nPreparation checks passed. Preview routes:');
  for (const route of previewRoutes) console.log(`  - ${route}`);
  console.log(
    '\nRun `npm run preview` to inspect locally, then commit and push to `main` to publish.',
  );
  console.log('No image upload, Git operation, or deployment was performed.');
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(
      `post:ready: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
