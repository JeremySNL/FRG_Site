/**
 * Plan the R2 media key migration.
 *
 * The bucket was seeded from a WordPress uploads folder, so every key is
 * `YYYY/MM/<original-file-name>` plus a same-path `.webp`. That layout encodes
 * the upload date instead of the content, and the file names are machine
 * exports (`119037367_3058066080959212_..._n.png`) with no meaning.
 *
 * This script reads every media reference in `src/content`, works out which
 * page, post, program or person owns each asset, and proposes a target key.
 * See `scripts/lib/media-naming.ts` for the naming rules.
 *
 * It also resolves which local file to encode from: WordPress wrote downscaled
 * derivatives (`-300x226`, `-225x300`) and those were uploaded as if they were
 * originals, so the delivery WebP was generated from a thumbnail. When the
 * full-size sibling exists on disk, the plan points at it instead.
 *
 * Usage:
 *
 *   node scripts/plan-media-keys.mts            # write scripts/media-migration.json
 *   node scripts/plan-media-keys.mts --dry-run  # print the plan only
 *
 * Environment:
 *
 *   WP_UPLOADS_DIR  where the old uploads folder is
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

import { collectMarkdownMediaReferences, extractSiteLogoPath } from './lib/media.ts';
import {
  baseNameOf,
  cleanEventSlug,
  DERIVATIVE_SUFFIX,
  descriptiveName,
  extensionOf,
  stripDerivativeSuffix,
} from './lib/media-naming.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src', 'content');
const manifestFile = join(root, 'scripts', 'media-migration.json');

if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const UPLOADS_DIR =
  process.env.WP_UPLOADS_DIR ??
  'C:/Users/jeremy/Local Sites/fundacionrosariogaton/app/public/wp-content/uploads';

const dryRun = process.argv.includes('--dry-run');

/** Raster formats that become a single WebP delivery object. */
const WEBP_SOURCE = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/** Extensions tried when the full-size sibling was re-encoded by WordPress. */
const FALLBACK_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

type OwnerKind = 'page' | 'post' | 'program' | 'team' | 'category' | 'tag';

interface Owner {
  kind: OwnerKind;
  slug: string;
  date?: string;
}

interface PlanEntry {
  legacy: string;
  target: string;
  source: string;
  sourceKind: 'full-size' | 'as-uploaded';
  owners: string[];
  nameKind: 'slug' | 'ordinal';
}

interface Album {
  ownersByKey: Map<string, Map<string, Owner>>;
}

/** Content collections that can own a media asset. */
const COLLECTIONS: Record<string, OwnerKind> = {
  posts: 'post',
  programs: 'program',
  team: 'team',
  categories: 'category',
  tags: 'tag',
  pages: 'page',
};

function dateOf(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    if (match?.[1]) return match[1];
  }
  return undefined;
}

/** Read every Markdown document and record who references which media key. */
async function collectOwners(): Promise<Album> {
  const ownersByKey = new Map<string, Map<string, Owner>>();

  const remember = (key: string, owner: Owner): void => {
    const label = `${owner.kind}:${owner.slug}`;
    let owners = ownersByKey.get(key);
    if (!owners) {
      owners = new Map();
      ownersByKey.set(key, owners);
    }
    const existing = owners.get(label);
    // Keep the first date seen; `es` is the source locale.
    if (!existing || (!existing.date && owner.date)) owners.set(label, owner);
  };

  for (const locale of await readdir(contentDir)) {
    const localeDir = join(contentDir, locale);
    let collections: string[];
    try {
      collections = await readdir(localeDir);
    } catch {
      continue;
    }

    for (const collection of collections) {
      const kind = COLLECTIONS[collection];
      if (!kind) continue;

      const directory = join(localeDir, collection);
      let files: string[];
      try {
        files = await readdir(directory);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        const source = await readFile(join(directory, file), 'utf8');
        const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1];
        let data: Record<string, unknown> = {};
        if (frontmatter) {
          try {
            data = (parseYaml(frontmatter) ?? {}) as Record<string, unknown>;
          } catch {
            data = {};
          }
        }

        const slug =
          typeof data['slug'] === 'string' && data['slug'].trim()
            ? data['slug'].trim()
            : file.replace(/\.md$/, '');

        const owner: Owner = {
          kind,
          slug,
          date: kind === 'post' ? dateOf(data['date']) : undefined,
        };

        for (const key of collectMarkdownMediaReferences(source).own) {
          remember(key, owner);
        }
      }
    }
  }

  return { ownersByKey };
}

/** Pick the folder that represents the asset, from most to least specific. */
function primaryOwner(owners: Owner[]): string {
  const posts = owners
    .filter((owner) => owner.kind === 'post' && owner.date)
    .sort(
      (a, b) =>
        (a.date ?? '').localeCompare(b.date ?? '') || a.slug.localeCompare(b.slug),
    );

  const post = posts[0];
  if (post?.date) return `photos/${post.date}-${cleanEventSlug(post.slug)}`;

  const entity = owners
    .filter((owner) => owner.kind === 'program' || owner.kind === 'team')
    .sort((a, b) => a.slug.localeCompare(b.slug))[0];

  if (entity) {
    return entity.kind === 'program'
      ? `programs/${entity.slug}`
      : `team/${entity.slug}`;
  }

  const pages = owners
    .filter((owner) => owner.kind === 'page')
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const page = pages[0];
  if (!page) return 'pages/site';
  return pages.length > 1 ? 'pages/site' : `pages/${page.slug}`;
}

/**
 * Pick the local file to encode from.
 *
 * WordPress kept the untouched upload next to its resized copies, so when the
 * reference points at `-300x226` the file worth publishing is the sibling
 * without the marker. Fall back to the derivative when nothing better exists.
 */
function resolveSource(legacy: string): {
  key: string;
  kind: 'full-size' | 'as-uploaded';
} {
  const stripped = stripDerivativeSuffix(legacy);
  if (stripped !== legacy) {
    const stem = stripped.replace(/\.[a-z0-9]+$/i, '');
    const candidates = [
      stripped,
      ...FALLBACK_EXTENSIONS.map((extension) => `${stem}${extension}`),
    ];
    for (const candidate of candidates) {
      if (existsSync(join(UPLOADS_DIR, candidate))) {
        return { key: candidate, kind: 'full-size' };
      }
    }
  }
  return { key: legacy, kind: 'as-uploaded' };
}

function plan(
  album: Album,
  logoKey: string | undefined,
): {
  entries: PlanEntry[];
  skipped: string[];
  missingSources: string[];
} {
  const entries: PlanEntry[] = [];
  const skipped: string[] = [];
  const missingSources: string[] = [];

  // Group by folder first: ordinals are assigned inside a folder.
  const grouped = new Map<string, Array<{ legacy: string; owners: Owner[] }>>();

  for (const [legacy, ownerMap] of album.ownersByKey) {
    const owners = [...ownerMap.values()];

    if (/^(?:brand|photos|pages|programs|team)\//.test(legacy)) {
      skipped.push(legacy);
      continue;
    }

    const folder = primaryOwner(owners);
    const list = grouped.get(folder) ?? [];
    list.push({ legacy, owners });
    grouped.set(folder, list);
  }

  // The brand mark is not an event photo: it keeps a stable, predictable key.
  if (logoKey) {
    const { key: sourceKey, kind: sourceKind } = resolveSource(logoKey);
    if (!existsSync(join(UPLOADS_DIR, sourceKey))) missingSources.push(logoKey);

    entries.push({
      legacy: logoKey,
      target: 'brand/logo.webp',
      source: sourceKey,
      sourceKind,
      owners: ['site:logo'],
      nameKind: 'slug',
    });

    for (const items of grouped.values()) {
      const index = items.findIndex((item) => item.legacy === logoKey);
      if (index >= 0) items.splice(index, 1);
    }
  }

  for (const [folder, items] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
    items.sort((a, b) => a.legacy.localeCompare(b.legacy));

    items.forEach((item, index) => {
      const extension = extensionOf(item.legacy);
      const deliveryExtension = WEBP_SOURCE.has(extension) ? '.webp' : extension;

      const { key: sourceKey, kind: sourceKind } = resolveSource(item.legacy);
      if (!existsSync(join(UPLOADS_DIR, sourceKey))) missingSources.push(item.legacy);

      // Name the file after the version that actually gets published, so a
      // WordPress resize marker never leaks into the key.
      const descriptive = descriptiveName(baseNameOf(sourceKey));
      const ordinal = String(index + 1).padStart(2, '0');
      const name = descriptive ? `${ordinal}-${descriptive}` : ordinal;

      // A collection entity has one representative image: no ordinal noise.
      const singleProgram = items.length === 1 && folder.startsWith('programs/');
      const singlePerson = items.length === 1 && folder.startsWith('team/');

      const target = singleProgram
        ? `${folder}/cover${deliveryExtension}`
        : singlePerson
          ? `team/${folder.slice('team/'.length)}${deliveryExtension}`
          : `${folder}/${name}${deliveryExtension}`;

      entries.push({
        legacy: item.legacy,
        target,
        source: sourceKey,
        sourceKind,
        owners: item.owners.map((owner) => `${owner.kind}:${owner.slug}`),
        nameKind: singleProgram || singlePerson || descriptive ? 'slug' : 'ordinal',
      });
    });
  }

  entries.sort((a, b) => a.legacy.localeCompare(b.legacy));
  return { entries, skipped, missingSources };
}

const album = await collectOwners();
const siteSource = await readFile(join(root, 'src', 'lib', 'site.ts'), 'utf8');
const logoKey = extractSiteLogoPath(siteSource);
const { entries, skipped, missingSources } = plan(album, logoKey);

const targets = new Set(entries.map((entry) => entry.target));
if (targets.size !== entries.length) {
  const seen = new Set<string>();
  const collisions = entries.filter((entry) => {
    if (seen.has(entry.target)) return true;
    seen.add(entry.target);
    return false;
  });
  console.error(
    `Target collision(s): ${collisions.map((entry) => entry.target).join(', ')}`,
  );
  process.exit(1);
}

const folders = new Set(
  entries.map((entry) => entry.target.slice(0, entry.target.lastIndexOf('/'))),
);
const fromFullSize = entries.filter((entry) => entry.sourceKind === 'full-size').length;
const noBetterSource = entries.filter(
  (entry) =>
    entry.sourceKind === 'as-uploaded' &&
    DERIVATIVE_SUFFIX.test(baseNameOf(entry.legacy)),
);
const fromOrdinal = entries.filter((entry) => entry.nameKind === 'ordinal').length;
const longest = entries.reduce((max, entry) => Math.max(max, entry.target.length), 0);

console.log(`Referenced assets:     ${entries.length}`);
console.log(`Target folders:        ${folders.size}`);
console.log(`Upgraded to full-size: ${fromFullSize}`);
console.log(`No better source:      ${noBetterSource.length}`);
console.log(`Named by slug:         ${entries.length - fromOrdinal}`);
console.log(`Named by ordinal:      ${fromOrdinal}`);
console.log(`Longest target key:    ${longest} chars`);

if (noBetterSource.length > 0) {
  console.log('\nResize marker with no full-size sibling on disk:');
  for (const entry of noBetterSource) console.log(`  ${entry.legacy}`);
}

if (skipped.length > 0) console.log(`\nAlready migrated: ${skipped.length}`);
if (missingSources.length > 0) {
  console.log(`\nMissing local source (${missingSources.length}):`);
  for (const key of missingSources) console.log(`  ${key}`);
}

console.log('\nFirst 20 mappings:');
for (const entry of entries.slice(0, 20)) {
  console.log(`  ${entry.legacy}`);
  console.log(`    -> ${entry.target}`);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  uploadsDir: UPLOADS_DIR,
  entries,
};
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (dryRun) {
  console.log('\nDry run: no manifest written.');
} else {
  await writeFile(manifestFile, serialized, 'utf8');
  console.log(`\nWrote ${entries.length} entries to scripts/media-migration.json`);
}
