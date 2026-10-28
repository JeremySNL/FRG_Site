/**
 * Apply the media key migration planned by `scripts/plan-media-keys.mts`.
 *
 * Each step is separate so it can be verified before the next one runs:
 *
 *   node scripts/apply-media-keys.mts --upload    # encode + upload new keys
 *   node scripts/apply-media-keys.mts --rewrite   # point content at new keys
 *   node scripts/apply-media-keys.mts --verify    # HEAD every new key
 *   node scripts/apply-media-keys.mts --prune     # delete the legacy keys
 *
 * `--prune` is intentionally not part of any default flow: the live site keeps
 * requesting the legacy keys until the new build is deployed. Run it only after
 * the deployment that serves the new keys is live.
 *
 * Environment:
 *
 *   WP_UPLOADS_DIR        where the old uploads folder is
 *   R2_ACCOUNT_ID         Cloudflare account id
 *   R2_ACCESS_KEY_ID      R2 access key id
 *   R2_SECRET_ACCESS_KEY  R2 secret access key
 *   R2_BUCKET             name of the bucket
 */
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AwsClient } from 'aws4fetch';
import sharp from 'sharp';

import { webpDeliveryKey } from './lib/media.ts';
import { isMediaPath, WEBP_DELIVERY_WIDTH } from '../src/lib/media-keys.ts';
import { R2_MEDIA_BASE_URL } from '../src/lib/media-url.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src', 'content');
const manifestFile = join(root, 'scripts', 'media-migration.json');

if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const UPLOADS_DIR =
  process.env.WP_UPLOADS_DIR ??
  'C:/Users/jeremy/Local Sites/fundacionrosariogaton/app/public/wp-content/uploads';

const BUCKET = process.env.R2_BUCKET ?? '';
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
const PUBLIC_URL = (
  process.env.MEDIA_BASE_URL ??
  process.env.R2_PUBLIC_URL ??
  R2_MEDIA_BASE_URL
).replace(/\/+$/, '');

const upload = process.argv.includes('--upload');
const rewrite = process.argv.includes('--rewrite');
const verify = process.argv.includes('--verify');
const prune = process.argv.includes('--prune');

if (!upload && !rewrite && !verify && !prune) {
  console.log('Nothing to do. Pass --upload, --rewrite, --verify or --prune.');
  process.exit(1);
}

interface PlanEntry {
  legacy: string;
  target: string;
  source: string;
  sourceKind: 'full-size' | 'as-uploaded' | 'remote';
  owners: string[];
  nameKind: 'slug' | 'ordinal';
  /** Origin to download from when the file never reached the local uploads folder. */
  remoteUrl?: string;
}

interface Manifest {
  generatedAt: string;
  uploadsDir: string;
  entries: PlanEntry[];
}

const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as Manifest;
const byLegacy = new Map(manifest.entries.map((entry) => [entry.legacy, entry]));

/** Third-party URLs that were pulled into the bucket, replaced verbatim. */
const externalSources = manifest.entries.filter((entry) =>
  entry.legacy.startsWith('http'),
);

const MIME_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
};

function mimeType(key: string): string {
  const extension = key.slice(key.lastIndexOf('.')).toLowerCase();
  return MIME_TYPES[extension] ?? 'application/octet-stream';
}

const WEBP_SOURCE = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const needsEncoding = (entry: PlanEntry): boolean =>
  WEBP_SOURCE.has(entry.target.slice(entry.target.lastIndexOf('.')).toLowerCase());

/** Encode one file for delivery: capped width, single WebP output. */
async function encode(entry: PlanEntry): Promise<Buffer> {
  let source: Buffer;
  if (entry.remoteUrl) {
    const response = await fetch(entry.remoteUrl);
    if (!response.ok) throw new Error(`${entry.remoteUrl}: HTTP ${response.status}.`);
    source = Buffer.from(new Uint8Array(await response.arrayBuffer()));
  } else {
    source = await readFile(join(UPLOADS_DIR, entry.source));
  }

  if (!needsEncoding(entry)) return source;

  return sharp(source)
    .resize({ width: WEBP_DELIVERY_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toBuffer();
}

function createClient(): AwsClient {
  if (
    BUCKET !== 'frg-media' ||
    !/^[a-f0-9]{32}$/i.test(ACCOUNT_ID) ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY
  ) {
    console.error('R2 configuration is incomplete; no request was attempted.');
    process.exit(1);
  }

  return new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
}

const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
const objectUrl = (key: string): string =>
  `${endpoint}/${BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`;

/** Run `task` over `items` with a bounded number of in-flight requests. */
async function pool<T>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;
      await task(item, index);
    }
  });
  await Promise.all(workers);
}

async function uploadKeys(): Promise<void> {
  const client = createClient();
  const total = manifest.entries.length;
  let uploaded = 0;
  let skipped = 0;
  let bytes = 0;

  await pool(manifest.entries, 4, async (entry) => {
    if (!isMediaPath(entry.target)) {
      throw new Error(`Unsafe target key: ${entry.target}`);
    }

    const body = await encode(entry);

    const head = await client.fetch(objectUrl(entry.target), { method: 'HEAD' });
    if (head.status === 200) {
      const length = Number(head.headers.get('content-length') ?? '0');
      if (length === body.byteLength) {
        skipped += 1;
        return;
      }
      throw new Error(
        `${entry.target} already exists with different content (${length} vs ${body.byteLength} bytes); refusing to overwrite.`,
      );
    }
    if (head.status !== 404) {
      throw new Error(`${entry.target}: preflight failed (${head.status}).`);
    }

    const response = await client.fetch(objectUrl(entry.target), {
      method: 'PUT',
      body: new Uint8Array(body),
      headers: {
        'content-type': mimeType(entry.target),
        'cache-control': 'public, max-age=31536000, immutable',
        'if-none-match': '*',
      },
    });

    if (!response.ok) {
      throw new Error(`${entry.target}: upload failed (${response.status}).`);
    }

    uploaded += 1;
    bytes += body.byteLength;
    if ((uploaded + skipped) % 25 === 0) {
      console.log(`  ${uploaded + skipped}/${total} processed`);
    }
  });

  console.log(
    `\nUploaded ${uploaded} objects (${(bytes / 1024 / 1024).toFixed(1)} MiB), ${skipped} already identical.`,
  );
}

/** Decode a URL path segment, tolerating malformed legacy escapes. */
function decodeKey(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const OWNED_UPLOAD_URL =
  /https?:\/\/(?:www\.)?fundacionrosariogaton\.org\/wp-content\/uploads\/([^\s"')<>\\]+)/g;

/** Absolute media URLs from the earlier R2 host, still used by a few pages. */
const R2_PUBLIC_URL =
  /https?:\/\/(?:pub-[a-z0-9]+\.r2\.dev|media\.fundacionrosariogaton\.org)\/([^\s"')<>\\]+)/g;

/** Relative legacy keys, with or without a leading slash. */
const RELATIVE_KEY = /(?<![\w.-])\/?((?:19|20)\d{2}\/\d{1,2}\/[^\s"')<>\\]+)/g;

/** Replace a reference only when the exact legacy key is in the manifest. */
function replaceWithTarget(raw: string): string | undefined {
  const cleaned = raw.replace(/[.,;:]+$/, '');
  const trailing = raw.slice(cleaned.length);
  const target = byLegacy.get(decodeKey(cleaned))?.target;
  return target ? `${target}${trailing}` : undefined;
}

function rewriteSource(text: string): { text: string; hits: number } {
  let hits = 0;

  const replace = (match: string, path: string): string => {
    const replacement = replaceWithTarget(path);
    if (!replacement) return match;
    hits += 1;
    return replacement;
  };

  let output = text.replace(OWNED_UPLOAD_URL, replace);
  output = output.replace(R2_PUBLIC_URL, replace);
  output = output.replace(RELATIVE_KEY, replace);

  // Assets that were hotlinked from another site and adopted into the bucket.
  for (const entry of externalSources) {
    if (!output.includes(entry.legacy)) continue;
    output = output.split(entry.legacy).join(entry.target);
    hits += 1;
  }

  // Markdown and rich-text bodies cannot use a bare relative key: Astro's
  // content pipeline tries to resolve those as local assets and fails the
  // build. Frontmatter goes through `mediaUrl()`, bodies need a real URL.
  const absolute = (match: string, before: string, key: string): string => {
    hits += 1;
    return `${before}${PUBLIC_URL}/${key}`;
  };
  output = output.replace(
    /(!\[[^\]]*\]\(\s*)((?:photos|pages|programs|team|brand)\/[^\s)"']+)/g,
    absolute,
  );
  output = output.replace(
    /(<img\b[^>]*?\bsrc=["'])((?:photos|pages|programs|team|brand)\/[^"']+)/gi,
    absolute,
  );

  return { text: output, hits };
}

async function walk(directory: string): Promise<string[]> {
  const files: string[] = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.name.endsWith('.md')) files.push(full);
  }

  return files;
}

async function rewriteContent(): Promise<void> {
  const files = await walk(contentDir);
  let changed = 0;
  let totalHits = 0;

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const { text, hits } = rewriteSource(source);
    if (hits > 0 && text !== source) {
      await writeFile(file, text, 'utf8');
      changed += 1;
      totalHits += hits;
    }
  }

  // The header/footer logo lives in the site config, not in content.
  const siteFile = join(root, 'src', 'lib', 'site.ts');
  const siteSource = await readFile(siteFile, 'utf8');
  const logoEntry = manifest.entries.find((entry) =>
    entry.owners.includes('site:logo'),
  );
  if (logoEntry) {
    const next = siteSource.replace(
      /(\blogo:\s*')([^']+)(')/,
      (_match, before: string, _value: string, after: string) =>
        `${before}${logoEntry.target}${after}`,
    );
    if (next !== siteSource) {
      await writeFile(siteFile, next, 'utf8');
      console.log(`Updated logo reference in src/lib/site.ts -> ${logoEntry.target}`);
    }
  }

  console.log(`\nRewrote ${totalHits} references across ${changed} content files.`);

  // Every legacy key must be gone, whatever the reference shape was.
  const legacyKeys = manifest.entries.map((entry) => entry.legacy);
  const leftovers: string[] = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const key of legacyKeys) {
      if (source.includes(key)) leftovers.push(`${relative(root, file)}: ${key}`);
    }
  }

  if (leftovers.length > 0) {
    console.error(`\n${leftovers.length} legacy reference(s) survived the rewrite:`);
    for (const line of leftovers.slice(0, 20)) console.error(`  ${line}`);
    process.exit(1);
  }
}

async function verifyKeys(): Promise<void> {
  const client = createClient();
  const failures: string[] = [];
  const sizes: Array<{ target: string; bytes: number }> = [];

  await pool(manifest.entries, 6, async (entry) => {
    const response = await client.fetch(objectUrl(entry.target), { method: 'HEAD' });
    if (response.status !== 200) {
      failures.push(`${entry.target}: HTTP ${response.status}`);
      return;
    }

    const type = response.headers.get('content-type') ?? '';
    if (type !== mimeType(entry.target)) {
      failures.push(`${entry.target}: content-type ${type}`);
    }

    const length = Number(response.headers.get('content-length') ?? '0');
    if (!Number.isFinite(length) || length <= 0) {
      failures.push(`${entry.target}: empty object`);
      return;
    }
    sizes.push({ target: entry.target, bytes: length });
  });

  const total = sizes.reduce((sum, item) => sum + item.bytes, 0);
  console.log(
    `\nVerified ${sizes.length}/${manifest.entries.length} objects, ${(total / 1024 / 1024).toFixed(1)} MiB total.`,
  );

  if (failures.length > 0) {
    console.error(`${failures.length} object(s) failed verification:`);
    for (const line of failures.slice(0, 20)) console.error(`  ${line}`);
    process.exit(1);
  }

  if (PUBLIC_URL) {
    const sample = manifest.entries[0];
    if (sample) {
      const response = await fetch(`${PUBLIC_URL}/${sample.target}`);
      console.log(`Public check ${sample.target}: HTTP ${response.status}`);
      if (!response.ok) process.exit(1);
    }
  }
}

async function pruneLegacy(): Promise<void> {
  const client = createClient();
  const keys = new Set<string>();

  for (const entry of manifest.entries) {
    keys.add(entry.legacy);
    const webp = webpDeliveryKey(entry.legacy);
    if (webp) keys.add(webp);
  }

  let deleted = 0;
  let missing = 0;

  await pool([...keys], 6, async (key) => {
    const response = await client.fetch(objectUrl(key), { method: 'DELETE' });
    if (response.ok || response.status === 204) deleted += 1;
    else if (response.status === 404) missing += 1;
    else throw new Error(`${key}: delete failed (${response.status}).`);
  });

  console.log(`\nDeleted ${deleted} legacy objects (${missing} already absent).`);
}

if (upload) await uploadKeys();
if (rewrite) await rewriteContent();
if (verify) await verifyKeys();
if (prune) await pruneLegacy();
