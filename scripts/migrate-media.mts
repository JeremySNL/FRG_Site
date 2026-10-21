/**
 * Copy the media of the old WordPress site to the media bucket.
 *
 * The paths are preserved: a file that lived at
 * `wp-content/uploads/2025/07/logo.png` keeps the key `2025/07/logo.png`, so
 * every URL of the migrated content keeps working.
 *
 * The script only touches the files the new site actually uses. Everything
 * else in the uploads folder is an orphan of the old site and is left alone.
 *
 * Usage:
 *
 *   node scripts/migrate-media.mts              # dry run: print the plan
 *   node scripts/migrate-media.mts --upload     # upload the files
 *   node scripts/migrate-media.mts --upload --variants
 *
 * Environment:
 *
 *   WP_UPLOADS_DIR        where the old uploads folder is
 *   R2_ACCOUNT_ID         Cloudflare account id
 *   R2_ACCESS_KEY_ID      R2 access key id
 *   R2_SECRET_ACCESS_KEY  R2 secret access key
 *   R2_BUCKET             name of the bucket
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AwsClient } from 'aws4fetch';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src', 'content');

const UPLOADS_DIR =
  process.env.WP_UPLOADS_DIR ??
  'C:/Users/jeremy/Local Sites/fundacionrosariogaton/app/public/wp-content/uploads';

const BUCKET = process.env.R2_BUCKET ?? '';
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
const PUBLIC_URL = process.env.R2_PUBLIC_URL ?? '';

const upload = process.argv.includes('--upload');
const withVariants = process.argv.includes('--variants');

/** Width of the generated WebP variant, in pixels. */
const VARIANT_WIDTH = 1600;

const MIME_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
};

/** The hosts whose media belongs to this site. */
const OWN_HOSTS = new Set([
  'fundacionrosariogaton.org',
  'www.fundacionrosariogaton.org',
]);

function mimeType(path: string): string {
  const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
  return MIME_TYPES[extension] ?? 'application/octet-stream';
}

/**
 * Collect every media path the content refers to.
 *
 * Both the frontmatter and the body are scanned: the frontmatter holds the
 * images of the blocks, the body holds the images of the blog posts.
 *
 * Only the media of this site is collected. A few posts hotlink images of
 * other websites — those are reported separately, they are not ours to move.
 */
async function collectReferencedMedia(): Promise<{
  own: Set<string>;
  external: Set<string>;
}> {
  const own = new Set<string>();
  const external = new Set<string>();

  const add = (value: string): void => {
    if (!value) return;

    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return;
    }

    const marker = '/wp-content/uploads/';
    const index = url.pathname.indexOf(marker);
    if (index === -1) return;

    const path = url.pathname.slice(index + marker.length);
    if (path === '') return;

    if (OWN_HOSTS.has(url.hostname.toLowerCase())) {
      own.add(path);
    } else {
      external.add(`${url.hostname}${url.pathname}`);
    }
  };

  const walk = async (directory: string): Promise<void> => {
    if (!existsSync(directory)) return;

    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }

      if (!entry.name.endsWith('.md')) continue;

      const source = await readFile(full, 'utf8');

      // Every `wp-content/uploads/…` occurrence, wherever it appears.
      for (const match of source.matchAll(
        /https?:\/\/[^\s"')<>]*\/wp-content\/uploads\/[^\s"')<>]+/g,
      )) {
        add(match[0]);
      }
    }
  };

  await walk(contentDir);

  return { own, external };
}

/** The file of the uploads folder that matches a media path. */
function localFileFor(mediaPath: string): string | undefined {
  const candidate = join(UPLOADS_DIR, mediaPath.replace(/\//g, sep));

  return existsSync(candidate) ? candidate : undefined;
}

const { own: referenced, external } = await collectReferencedMedia();

const missing: string[] = [];
const files: Array<{ key: string; local: string }> = [];

for (const mediaPath of [...referenced].sort()) {
  const local = localFileFor(mediaPath);

  if (!local) {
    missing.push(mediaPath);
    continue;
  }

  files.push({ key: mediaPath, local });
}

console.log(`Referenced media: ${referenced.size}`);
console.log(`  found locally:  ${files.length}`);
console.log(`  missing:        ${missing.length}`);

if (missing.length > 0) {
  console.log('\nMissing files:');
  for (const path of missing) console.log(`  ${path}`);
}

if (external.size > 0) {
  console.log('\nImages hotlinked from other websites (not moved):');
  for (const path of [...external].sort()) console.log(`  ${path}`);
}

/** The key of the WebP variant of an image. */
function variantKey(key: string): string {
  const dot = key.lastIndexOf('.');
  return `${key.slice(0, dot)}-${VARIANT_WIDTH}w.webp`;
}

if (!upload) {
  console.log('\nDry run. Add --upload to copy the files to the bucket.');
  console.log('\nFirst files:');
  for (const file of files.slice(0, 10)) {
    console.log(`  ${file.key}  (${relative(root, file.local)})`);
  }
  process.exit(0);
}

if (!BUCKET || !ACCOUNT_ID) {
  console.error('R2_BUCKET and R2_ACCOUNT_ID are required to upload. Aborting.');
  process.exit(1);
}

const client = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  service: 's3',
  region: 'auto',
});

const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

/** Upload one file. */
async function put(key: string, body: BodyInit, type: string): Promise<void> {
  const response = await client.fetch(`${endpoint}/${BUCKET}/${key}`, {
    method: 'PUT',
    body,
    headers: {
      'content-type': type,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });

  if (!response.ok) {
    throw new Error(`${key}: ${response.status} ${await response.text()}`);
  }
}

let uploaded = 0;

for (const file of files) {
  const buffer = await readFile(file.local);

  await put(file.key, new Uint8Array(buffer), mimeType(file.key));
  uploaded += 1;

  if (withVariants && /\.(jpe?g|png|webp)$/i.test(file.key)) {
    const variant = await sharp(buffer)
      .resize({ width: VARIANT_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    await put(variantKey(file.key), new Uint8Array(variant), 'image/webp');
    uploaded += 1;
  }

  if (uploaded % 25 === 0) console.log(`  ${uploaded} objects uploaded`);
}

console.log(`\nDone. ${uploaded} objects uploaded to ${BUCKET}.`);
if (PUBLIC_URL) console.log(`Public URL: ${PUBLIC_URL}`);
