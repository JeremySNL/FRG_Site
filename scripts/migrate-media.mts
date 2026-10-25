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
import { createReadStream, existsSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AwsClient } from 'aws4fetch';
import sharp from 'sharp';
import {
  collectMarkdownMediaReferences,
  extractSiteLogoPath,
  isMediaPath,
  WEBP_VARIANT_WIDTH,
  webpVariantKey,
} from './lib/media.ts';
import {
  buildUploadKeyManifest,
  isMatchingR2Etag,
  isValidR2PublicUrl,
} from './lib/r2.ts';

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
  scanErrors: string[];
}> {
  const own = new Set<string>();
  const external = new Set<string>();
  const scanErrors: string[] = [];

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

      let media: ReturnType<typeof collectMarkdownMediaReferences>;
      try {
        media = collectMarkdownMediaReferences(source);
      } catch {
        scanErrors.push(`${relative(root, full)}: media scan failed`);
        continue;
      }
      for (const path of media.own) own.add(path);
      for (const path of media.external) external.add(path);
      for (const error of media.errors) {
        scanErrors.push(`${relative(root, full)}: ${error}`);
      }
    }
  };

  await walk(contentDir);

  const siteSource = await readFile(join(root, 'src', 'lib', 'site.ts'), 'utf8');
  const logo = extractSiteLogoPath(siteSource);
  if (logo) own.add(logo);

  return { own, external, scanErrors };
}

/** The file of the uploads folder that matches a media path. */
function localFileFor(mediaPath: string): string | undefined {
  if (!isMediaPath(mediaPath)) {
    throw new Error(`Unsafe media key rejected before local file access: ${mediaPath}`);
  }

  const uploadsRoot = resolve(UPLOADS_DIR);
  const candidate = resolve(uploadsRoot, mediaPath.replace(/\//g, sep));
  const relativeCandidate = relative(uploadsRoot, candidate);
  if (
    relativeCandidate === '..' ||
    relativeCandidate.startsWith(`..${sep}`) ||
    isAbsolute(relativeCandidate)
  ) {
    throw new Error(`Media key escapes the uploads directory: ${mediaPath}`);
  }

  if (!existsSync(candidate) || !existsSync(uploadsRoot)) return undefined;

  const realRoot = realpathSync(uploadsRoot);
  const realCandidate = realpathSync(candidate);
  const relativeRealCandidate = relative(realRoot, realCandidate);
  if (
    relativeRealCandidate === '..' ||
    relativeRealCandidate.startsWith(`..${sep}`) ||
    isAbsolute(relativeRealCandidate)
  ) {
    throw new Error(`Media file resolves outside the uploads directory: ${mediaPath}`);
  }

  return realCandidate;
}

const { own: referenced, external, scanErrors } = await collectReferencedMedia();

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

if (scanErrors.length > 0) {
  console.log('\nMedia scan warnings:');
  for (const error of scanErrors) console.log(`  ${error}`);
}

if (!upload) {
  console.log('\nDry run. Add --upload to copy the files to the bucket.');
  console.log('\nFirst files:');
  for (const file of files.slice(0, 10)) {
    console.log(`  ${file.key}`);
  }
  process.exit(0);
}

if (scanErrors.length > 0) {
  console.error('Media inventory is incomplete; no R2 uploads were attempted.');
  process.exit(1);
}

if (files.length === 0) {
  console.error('No local media files are available to upload.');
  process.exit(1);
}

if (
  BUCKET !== 'frg-media' ||
  !/^[a-f0-9]{32}$/i.test(ACCOUNT_ID) ||
  !process.env.R2_ACCESS_KEY_ID ||
  !process.env.R2_SECRET_ACCESS_KEY ||
  !isValidR2PublicUrl(PUBLIC_URL)
) {
  console.error(
    'R2 upload configuration is incomplete or invalid; no upload was attempted.',
  );
  process.exit(1);
}

const uploadManifest = buildUploadKeyManifest(
  files.map((file) => file.key),
  withVariants,
);
if (uploadManifest.collisions.length > 0) {
  console.error(
    `The upload manifest contains ${uploadManifest.collisions.length} key collision(s); no upload was attempted.`,
  );
  for (const key of uploadManifest.collisions) console.error(`  ${key}`);
  process.exit(1);
}

interface UploadObject {
  key: string;
  local: string;
  variant: boolean;
  contentType: string;
}

const uploadObjects: UploadObject[] = files.flatMap((file) => {
  const objects: UploadObject[] = [
    {
      key: file.key,
      local: file.local,
      variant: false,
      contentType: mimeType(file.key),
    },
  ];
  const variantKey = withVariants ? webpVariantKey(file.key) : undefined;
  if (variantKey) {
    objects.push({
      key: variantKey,
      local: file.local,
      variant: true,
      contentType: 'image/webp',
    });
  }
  return objects;
});

const client = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  service: 's3',
  region: 'auto',
});

const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

function s3ObjectUrl(key: string): string {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${endpoint}/${BUCKET}/${encodedKey}`;
}

/** Refuse a non-empty destination before the first write. */
async function preflightDestination(): Promise<Set<string>> {
  const existingIdentical = new Set<string>();

  const md5For = async (object: UploadObject): Promise<string> => {
    if (!object.variant) {
      return new Promise((resolveHash, rejectHash) => {
        const hash = createHash('md5');
        const stream = createReadStream(object.local);
        stream.on('data', (chunk: Buffer) => hash.update(chunk));
        stream.on('error', rejectHash);
        stream.on('end', () => resolveHash(hash.digest('hex')));
      });
    }

    const source = await readFile(object.local);
    const variantBuffer = await sharp(source)
      .resize({ width: WEBP_VARIANT_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return createHash('md5').update(variantBuffer).digest('hex');
  };

  for (let offset = 0; offset < uploadObjects.length; offset += 8) {
    const batch = uploadObjects.slice(offset, offset + 8);
    const results = await Promise.all(
      batch.map(async (object) => {
        const response = await client.fetch(s3ObjectUrl(object.key), {
          method: 'HEAD',
        });
        return { object, response };
      }),
    );

    for (const { object, response } of results) {
      if (response.status === 404) continue;
      if (response.status >= 200 && response.status < 300) {
        const expectedMd5 = await md5For(object);
        if (!isMatchingR2Etag(response.headers.get('etag'), expectedMd5)) {
          throw new Error(
            `R2 object ${object.key} exists with different or unverifiable content; refusing to overwrite it.`,
          );
        }
        existingIdentical.add(object.key);
        continue;
      }
      throw new Error(
        `R2 destination preflight failed (${response.status}); no object uploads were attempted.`,
      );
    }
  }

  return existingIdentical;
}

let existingIdentical: Set<string>;
try {
  existingIdentical = await preflightDestination();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'R2 destination preflight failed.',
  );
  process.exit(1);
}

/** Upload one file. */
async function put(key: string, body: BodyInit, type: string): Promise<void> {
  const response = await client.fetch(s3ObjectUrl(key), {
    method: 'PUT',
    body,
    headers: {
      'content-type': type,
      'cache-control': 'public, max-age=31536000, immutable',
      'if-none-match': '*',
    },
  });

  if (!response.ok) {
    throw new Error(`${key}: upload failed (${response.status}).`);
  }
}

let uploaded = 0;
let skipped = 0;

for (const object of uploadObjects) {
  if (existingIdentical.has(object.key)) {
    skipped += 1;
    continue;
  }

  const source = await readFile(object.local);
  const body = object.variant
    ? await sharp(source)
        .resize({ width: WEBP_VARIANT_WIDTH, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer()
    : source;

  await put(object.key, new Uint8Array(body), object.contentType);
  uploaded += 1;

  if (uploaded % 25 === 0) console.log(`  ${uploaded} objects uploaded`);
}

console.log(
  `\nDone. ${uploaded} objects uploaded and ${skipped} identical existing objects reused in ${BUCKET}.`,
);
