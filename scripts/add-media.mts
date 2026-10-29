/**
 * Upload images to the media bucket.
 *
 * This is the publishing step the content pipeline does not cover:
 * `npm run post:ready` handles translation and quality checks, but it never
 * touches R2. This command owns that one job and prints the references the
 * content needs.
 *
 *   npm run media:add -- --post mi-post --file ./fotos/01.jpg ./fotos/02.jpg
 *   npm run media:add -- --page contacto --file ./foto.jpg
 *   npm run media:add -- --program vivienda-digna --file ./portada.jpg
 *   npm run media:add -- --team rosario-gaton --file ./retrato.jpg
 *   npm run media:add -- --dir brand --file ./logo.png
 *
 * Numbered targets (post, event, page, dir) append to the folder, so a second
 * run never overwrites the first. Single-asset targets (program cover, team
 * portrait) keep one fixed key: replacing it writes the next version
 * (`cover.webp` -> `cover-2.webp`) because the objects are cached as immutable
 * for a year, and prints the frontmatter line to update.
 *
 * Every file is encoded to WebP at the delivery width, uploaded, and verified
 * through the public URL. The command never edits content, commits, deploys, or
 * touches the migration manifest.
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
  normalizeDir,
  pageFolder,
  parseMediaAddArgs,
  programKey,
  teamKey,
  versionedKey,
  type MediaAddOptions,
} from './lib/media-add.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src', 'content', 'es');

if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const BUCKET = process.env.R2_BUCKET ?? '';
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
const PUBLIC_URL = (
  process.env.MEDIA_BASE_URL ??
  process.env.R2_PUBLIC_URL ??
  R2_MEDIA_BASE_URL
).replace(/\/+$/, '');

const USAGE = [
  'Usage: npm run media:add -- <target> --file <path...> [--alt "texto"] [--dry-run]',
  '',
  'Targets (exactly one):',
  '  --post <slug>           photos/<fecha>-<evento>/        numerado, fecha leída del post',
  '  --event <fecha-evento>  photos/<fecha>-<evento>/        numerado',
  '  --page <slug>           pages/<slug>/                   numerado',
  '  --program <slug>        programs/<slug>/cover.webp      clave fija, versionada al reemplazar',
  '  --team <slug>           team/<slug>.webp                clave fija, versionada al reemplazar',
  '  --dir <carpeta>         cualquier carpeta, ej. brand/   numerado',
  '',
  '  --file      Uno o más archivos locales (repetí la bandera o listalos después).',
  '  --alt       Texto alternativo para los fragmentos que imprime.',
  '  --dry-run   Codifica e informa, sin subir nada.',
  '',
  'Nunca edita contenido, commitea ni despliega.',
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

/** Read and parse the Spanish document that owns a target. */
async function readDocument(
  collection: 'posts' | 'pages' | 'programs' | 'team',
  slug: string,
): Promise<Record<string, unknown>> {
  const path = join(contentDir, collection, `${slug}.md`);

  if (!existsSync(path)) {
    throw new Error(`No Spanish source at src/content/es/${collection}/${slug}.md.`);
  }

  const source = await readFile(path, 'utf8');
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1];
  if (!frontmatter) throw new Error(`${collection}/${slug} has no YAML frontmatter.`);

  return (parseYaml(frontmatter) ?? {}) as Record<string, unknown>;
}

interface Plan {
  /** Folder that receives the uploads (numbered targets) or holds the key. */
  folder: string;
  /** Fixed key for single-asset targets. */
  fixedKey?: string;
  alt: string;
  /** Where the reference lives, for the closing instructions. */
  hint?: string;
}

/** Decide where the files of this run go. */
async function resolvePlan(options: MediaAddOptions): Promise<Plan> {
  if (options.post) {
    const data = await readDocument('posts', options.post);
    if (data['slug'] !== options.post) {
      throw new Error(
        `Frontmatter slug must match the filename slug "${options.post}".`,
      );
    }
    if (data['locale'] !== 'es')
      throw new Error('The source post must set locale: "es".');

    const date = isoDateOf(data['date']);
    if (!date) {
      throw new Error(
        `The post ${options.post} needs a valid \`date\` in its frontmatter.`,
      );
    }

    return {
      folder: mediaFolderFor(date, options.post),
      alt: String(data['title'] ?? options.post),
      hint: `npm run post:ready -- --slug ${options.post}`,
    };
  }

  if (options.event) {
    return { folder: `photos/${options.event}`, alt: options.event };
  }

  if (options.page) {
    const data = await readDocument('pages', options.page);
    return {
      folder: pageFolder(options.page),
      alt: String(data['title'] ?? options.page),
      hint: `src/content/es/pages/${options.page}.md`,
    };
  }

  if (options.program) {
    const data = await readDocument('programs', options.program);
    const key = programKey(options.program);
    return {
      folder: key.slice(0, key.lastIndexOf('/')),
      fixedKey: key,
      alt: String(data['title'] ?? options.program),
      hint: `src/content/es/programs/${options.program}.md`,
    };
  }

  if (options.team) {
    const data = await readDocument('team', options.team);
    const key = teamKey(options.team);
    return {
      folder: key.slice(0, key.lastIndexOf('/')),
      fixedKey: key,
      alt: String(data['name'] ?? options.team),
      hint: `src/content/es/team/${options.team}.md`,
    };
  }

  const dir = options.dir ? normalizeDir(options.dir) : '';
  if (!dir || !isSafeFolder(dir, 1)) {
    throw new Error('Pass one of --post, --event, --page, --program, --team or --dir.');
  }

  return { folder: dir, alt: dir.split('/').pop() ?? dir };
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

  const plan = await resolvePlan(options);

  console.log(`Folder: ${plan.folder}`);
  if (plan.fixedKey) console.log(`Key:    ${plan.fixedKey} (clave fija)`);
  console.log(`Files:  ${options.files.length}`);

  // A dry run still lists the folder, so the printed key matches reality.
  if (!options.dryRun) assertConfiguration();
  const client = isConfigured() ? createClient() : undefined;
  const existing = client ? await listKeys(client, `${plan.folder}/`) : [];
  const startOrdinal = nextOrdinal(existing);

  if (!client) console.log('R2 is not configured: assuming the folder is empty.');
  if (!plan.fixedKey && startOrdinal > 1) {
    console.log(`Existing keys: ${existing.length} (next: ${startOrdinal})`);
  }

  const numbered = plan.fixedKey
    ? []
    : buildMediaTargets(plan.folder, options.files, startOrdinal);

  const uploaded: Array<{ key: string; width: number; height: number; bytes: number }> =
    [];
  let reusedKey: string | undefined;
  let previousKey: string | undefined;

  for (const [index, file] of options.files.entries()) {
    const encoded = await encodeFile(file);
    const kib = Math.round(encoded.body.byteLength / 1024);
    const dimensions = `${encoded.width}x${encoded.height}`;
    const source =
      encoded.sourceWidth === encoded.width && encoded.sourceHeight === encoded.height
        ? ''
        : ` (desde ${encoded.sourceWidth}x${encoded.sourceHeight})`;

    let key: string;

    if (plan.fixedKey) {
      // Reuse the exact object when the bytes match; otherwise version it, so
      // nobody with the old image cached keeps seeing it.
      let sameBytes = false;
      if (client && existing.includes(plan.fixedKey)) {
        const head = await client.fetch(objectUrl(plan.fixedKey), { method: 'HEAD' });
        const length = Number(head.headers.get('content-length') ?? '0');
        sameBytes = head.status === 200 && length === encoded.body.byteLength;
      }

      if (sameBytes) {
        console.log(`  skip ${plan.fixedKey}  ya es idéntica`);
        reusedKey = plan.fixedKey;
        uploaded.push({
          key: plan.fixedKey,
          width: encoded.width,
          height: encoded.height,
          bytes: encoded.body.byteLength,
        });
        continue;
      }

      key = versionedKey(plan.fixedKey, existing);
      if (key !== plan.fixedKey) previousKey = plan.fixedKey;
    } else {
      const target = numbered[index];
      if (!target) throw new Error('Internal error: missing numbered target.');
      key = target.key;
    }

    if (!isMediaPath(key)) throw new Error(`Unsafe target key: ${key}`);

    if (options.dryRun || !client) {
      console.log(`  plan ${key}  ${dimensions}${source}  ${kib} KiB`);
      uploaded.push({
        key,
        width: encoded.width,
        height: encoded.height,
        bytes: encoded.body.byteLength,
      });
      continue;
    }

    const head = await client.fetch(objectUrl(key), { method: 'HEAD' });
    if (head.status === 200) {
      const length = Number(head.headers.get('content-length') ?? '0');
      if (length === encoded.body.byteLength) {
        console.log(`  skip ${key}  ya es idéntica`);
        uploaded.push({
          key,
          width: encoded.width,
          height: encoded.height,
          bytes: encoded.body.byteLength,
        });
        continue;
      }
      throw new Error(
        `${key} already exists with different content (${length} vs ${encoded.body.byteLength} bytes). Pick another file name or bump the version.`,
      );
    }
    if (head.status !== 404) {
      throw new Error(`${key}: preflight failed (${head.status}).`);
    }

    const response = await client.fetch(objectUrl(key), {
      method: 'PUT',
      body: new Uint8Array(encoded.body),
      headers: {
        'content-type': 'image/webp',
        'cache-control': 'public, max-age=31536000, immutable',
        'if-none-match': '*',
      },
    });

    if (!response.ok) {
      throw new Error(`${key}: upload failed (${response.status}).`);
    }

    const check = await fetch(`${PUBLIC_URL}/${key}`, { method: 'HEAD' });
    if (!check.ok) throw new Error(`${key}: public check failed (${check.status}).`);

    console.log(`  ok   ${key}  ${dimensions}${source}  ${kib} KiB`);
    uploaded.push({
      key,
      width: encoded.width,
      height: encoded.height,
      bytes: encoded.body.byteLength,
    });
  }

  const hero = uploaded[0];
  if (!hero) return;

  const alt = options.alt ?? plan.alt;
  const totalKib = Math.round(
    uploaded.reduce((sum, item) => sum + item.bytes, 0) / 1024,
  );

  console.log(`\n${uploaded.length} object(s), ${totalKib} KiB.`);
  if (options.dryRun) console.log('Dry run: nothing was uploaded.');

  console.log('\nFrontmatter (clave relativa, se resuelve con mediaUrl()):');
  console.log(`  image: "${hero.key}"`);
  console.log(`  imageAlt: "${alt}"`);

  if (reusedKey) {
    console.log('\nLa imagen ya era idéntica: la referencia no cambia.');
  }
  if (previousKey) {
    console.log(
      `\nImportante: ${previousKey} sigue en el bucket (es inmutable). La referencia nueva es la de arriba.`,
    );
  }

  console.log('\nMarkdown body (URL absoluta, obligatoria en el cuerpo):');
  for (const item of uploaded) {
    console.log(`  ![${alt}](${PUBLIC_URL}/${item.key})`);
  }

  if (plan.hint) console.log(`\nActualiza \`image\` en: ${plan.hint}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
