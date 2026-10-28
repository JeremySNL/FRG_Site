/**
 * Upload the photos of one post (or one event) to the media bucket.
 *
 * This is the missing step of the publishing flow: `npm run post:ready` handles
 * translation and quality checks, but it deliberately never touches R2. This
 * command does exactly that one job, and prints the two references the post
 * needs.
 *
 *   npm run media:add -- --post mi-post --file ./fotos/01.jpg ./fotos/02.jpg
 *   npm run media:add -- --event 2026-11-05-jornada-medica --file ./foto.jpg
 *
 * It encodes every file to WebP at the delivery width, refuses to overwrite an
 * existing key with different bytes (keys are cached as immutable), uploads,
 * verifies the public URL, and prints:
 *
 *   - the relative key for `image:` in the frontmatter
 *   - the absolute URL for image tags in the Markdown body
 *
 * It never edits content, commits, or deploys. The migration manifest is not
 * touched either: it records the WordPress import, not later uploads.
 *
 * Environment:
 *
 *   R2_ACCOUNT_ID         Cloudflare account id
 *   R2_ACCESS_KEY_ID      R2 access key id
 *   R2_SECRET_ACCESS_KEY  R2 secret access key
 *   R2_BUCKET             bucket name (must be `frg-media`)
 *   MEDIA_BASE_URL        public media host (defaults to the R2 custom domain)
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AwsClient } from 'aws4fetch';
import sharp from 'sharp';
import { parse as parseYaml } from 'yaml';

import { isMediaPath, WEBP_DELIVERY_WIDTH } from '../src/lib/media-keys.ts';
import { R2_MEDIA_BASE_URL } from '../src/lib/media-url.ts';
import {
  buildMediaTargets,
  isSafeFolder,
  isoDateOf,
  mediaFolderFor,
  nextOrdinal,
  parseMediaAddArgs,
} from './lib/media-add.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePostsDir = join(root, 'src', 'content', 'es', 'posts');

if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const BUCKET = process.env.R2_BUCKET ?? '';
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
const PUBLIC_URL = (
  process.env.MEDIA_BASE_URL ??
  process.env.R2_PUBLIC_URL ??
  R2_MEDIA_BASE_URL
).replace(/\/+$/, '');

const USAGE = [
  'Usage: npm run media:add -- (--post <slug> | --event <YYYY-MM-DD-slug>) --file <path...> [--alt "text"] [--dry-run]',
  '',
  '  --post   Spanish post slug; its date and name define the folder.',
  '  --event  Explicit event folder for media that has no post.',
  '  --file   One or more local images (repeat the flag or list them after it).',
  '  --alt    Alt text reused in the printed snippets.',
  '  --dry-run  Encode and report, upload nothing.',
  '',
  'Never edits content, commits, or deploys.',
].join('\n');

/** Whether the R2 credentials needed to list and upload are present. */
function isConfigured(): boolean {
  return (
    BUCKET === 'frg-media' &&
    /^[a-f0-9]{32}$/i.test(ACCOUNT_ID) &&
    Boolean(process.env.R2_ACCESS_KEY_ID) &&
    Boolean(process.env.R2_SECRET_ACCESS_KEY)
  );
}

/** Reject the run before touching the network when credentials are missing. */
function assertConfiguration(): void {
  if (!isConfigured()) {
    console.error(
      'R2 configuration is incomplete. Define R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET (frg-media) in .env.',
    );
    process.exit(1);
  }
}

function createClient(): AwsClient {
  return new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    service: 's3',
    region: 'auto',
  });
}

const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
const objectUrl = (key: string): string =>
  `${endpoint}/${BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`;

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** Every key currently stored under `prefix`, following pagination. */
async function listKeys(client: AwsClient, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;

  for (;;) {
    const url = new URL(`${endpoint}/${BUCKET}`);
    url.searchParams.set('list-type', '2');
    url.searchParams.set('prefix', prefix);
    url.searchParams.set('max-keys', '1000');
    if (token) url.searchParams.set('continuation-token', token);

    const response = await client.fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Listing ${prefix} failed (${response.status}).`);
    }

    const xml = await response.text();
    for (const match of xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)) {
      keys.push(decodeXml(match[1] ?? ''));
    }

    const next = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(
      xml,
    )?.[1];
    if (!next) break;
    token = decodeXml(next);
  }

  return keys;
}

interface Encoded {
  body: Buffer;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}

/** Encode one file for delivery, honouring the EXIF orientation of phone photos. */
async function encodeFile(file: string): Promise<Encoded> {
  const source = await readFile(file);
  const original = await sharp(source).metadata();

  const body = await sharp(source)
    .rotate()
    .resize({ width: WEBP_DELIVERY_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toBuffer();

  const encoded = await sharp(body).metadata();

  return {
    body,
    width: encoded.width ?? 0,
    height: encoded.height ?? 0,
    sourceWidth: original.width ?? 0,
    sourceHeight: original.height ?? 0,
  };
}

/** Read the date and title a post contributes to the folder and the snippets. */
async function readPost(slug: string): Promise<{ date: string; title: string }> {
  const path = join(sourcePostsDir, `${slug}.md`);

  if (!existsSync(path)) {
    throw new Error(`No Spanish source post at src/content/es/posts/${slug}.md.`);
  }

  const source = await readFile(path, 'utf8');
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1];
  if (!frontmatter) throw new Error(`The post ${slug} has no YAML frontmatter.`);

  const data = (parseYaml(frontmatter) ?? {}) as Record<string, unknown>;

  if (data['slug'] !== slug) {
    throw new Error(`Frontmatter slug must match the filename slug "${slug}".`);
  }
  if (data['locale'] !== 'es') {
    throw new Error('The source post must set locale: "es".');
  }

  const date = isoDateOf(data['date']);
  if (!date)
    throw new Error(`The post ${slug} needs a valid \`date\` in its frontmatter.`);

  return { date, title: String(data['title'] ?? slug) };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return;
  }

  const options = parseMediaAddArgs(args);

  for (const file of options.files) {
    if (!existsSync(file)) throw new Error(`File not found: ${file}`);
  }

  let folder: string;
  let defaultAlt: string;

  if (options.post) {
    const post = await readPost(options.post);
    folder = mediaFolderFor(post.date, options.post);
    defaultAlt = post.title;
  } else {
    folder = `photos/${options.event ?? ''}`;
    defaultAlt = options.event ?? '';
  }

  if (!isSafeFolder(folder)) {
    throw new Error(`Unsafe media folder: ${folder}`);
  }

  console.log(`Folder: ${folder}`);
  console.log(`Files:  ${options.files.length}`);

  // A dry run still lists the folder, so the printed ordinal matches reality.
  if (!options.dryRun) assertConfiguration();
  const client = isConfigured() ? createClient() : undefined;
  const existing = client ? await listKeys(client, `${folder}/`) : [];
  const startOrdinal = nextOrdinal(existing);

  if (!client) console.log('R2 is not configured: assuming the folder is empty.');
  if (startOrdinal > 1) {
    console.log(`Existing keys: ${existing.length} (next: ${startOrdinal})`);
  }

  const targets = buildMediaTargets(folder, options.files, startOrdinal);
  const uploaded: Array<{ key: string; width: number; height: number; bytes: number }> =
    [];

  for (const target of targets) {
    if (!isMediaPath(target.key)) {
      throw new Error(`Unsafe target key: ${target.key}`);
    }

    const encoded = await encodeFile(target.file);
    const kib = Math.round(encoded.body.byteLength / 1024);
    const dimensions = `${encoded.width}x${encoded.height}`;
    const source =
      encoded.sourceWidth === encoded.width && encoded.sourceHeight === encoded.height
        ? ''
        : ` (from ${encoded.sourceWidth}x${encoded.sourceHeight})`;

    if (options.dryRun || !client) {
      console.log(`  plan ${target.key}  ${dimensions}${source}  ${kib} KiB`);
      uploaded.push({
        key: target.key,
        width: encoded.width,
        height: encoded.height,
        bytes: encoded.body.byteLength,
      });
      continue;
    }

    const head = await client.fetch(objectUrl(target.key), { method: 'HEAD' });
    if (head.status === 200) {
      const length = Number(head.headers.get('content-length') ?? '0');
      if (length === encoded.body.byteLength) {
        console.log(`  skip ${target.key}  already identical`);
        uploaded.push({
          key: target.key,
          width: encoded.width,
          height: encoded.height,
          bytes: encoded.body.byteLength,
        });
        continue;
      }
      throw new Error(
        `${target.key} already exists with different content (${length} vs ${encoded.body.byteLength} bytes). Keys are immutable: pick a new file name or remove the object first.`,
      );
    }
    if (head.status !== 404) {
      throw new Error(`${target.key}: preflight failed (${head.status}).`);
    }

    const response = await client.fetch(objectUrl(target.key), {
      method: 'PUT',
      body: new Uint8Array(encoded.body),
      headers: {
        'content-type': 'image/webp',
        'cache-control': 'public, max-age=31536000, immutable',
        'if-none-match': '*',
      },
    });

    if (!response.ok) {
      throw new Error(`${target.key}: upload failed (${response.status}).`);
    }

    const check = await fetch(`${PUBLIC_URL}/${target.key}`, { method: 'HEAD' });
    if (!check.ok) {
      throw new Error(`${target.key}: public check failed (${check.status}).`);
    }

    console.log(`  ok   ${target.key}  ${dimensions}${source}  ${kib} KiB`);
    uploaded.push({
      key: target.key,
      width: encoded.width,
      height: encoded.height,
      bytes: encoded.body.byteLength,
    });
  }

  const hero = uploaded[0];
  if (!hero) return;

  const alt = options.alt ?? defaultAlt;
  const totalKib = Math.round(
    uploaded.reduce((sum, item) => sum + item.bytes, 0) / 1024,
  );

  console.log(`\n${uploaded.length} object(s), ${totalKib} KiB.`);
  if (options.dryRun) {
    console.log('Dry run: nothing was uploaded.');
  }

  console.log('\nFrontmatter (relative key, resolved through mediaUrl()):');
  console.log(`  image: "${hero.key}"`);
  console.log(`  imageAlt: "${alt}"`);

  console.log('\nMarkdown body (absolute URL, required by the content pipeline):');
  for (const item of uploaded) {
    console.log(`  ![${alt}](${PUBLIC_URL}/${item.key})`);
  }

  if (options.post) {
    console.log(`\nNext: npm run post:ready -- --slug ${options.post}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
