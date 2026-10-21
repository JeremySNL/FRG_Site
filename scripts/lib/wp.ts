/**
 * A read-only model of a WordPress database, built from a `mysqldump` file.
 */
import { readTable } from './sql.ts';

export interface WpPost {
  id: number;
  author: number;
  date: string;
  dateGmt: string;
  content: string;
  title: string;
  excerpt: string;
  status: string;
  name: string;
  parent: number;
  guid: string;
  menuOrder: number;
  type: string;
  mimeType: string;
}

export interface WpTerm {
  id: number;
  name: string;
  slug: string;
}

export interface WpTaxonomy {
  termTaxonomyId: number;
  termId: number;
  taxonomy: string;
  description: string;
  parent: number;
  count: number;
}

export interface WpAttachment {
  id: number;
  title: string;
  file: string;
  url: string;
  mime: string;
  alt: string;
}

export interface WpDatabase {
  posts: Map<number, WpPost>;
  meta: Map<number, Map<string, string>>;
  terms: Map<number, WpTerm>;
  taxonomies: Map<number, WpTaxonomy>;
  relationships: Map<number, Array<{ termId: number; taxonomy: string }>>;
  attachments: Map<number, WpAttachment>;
}

const POST_COLUMNS = [
  'ID',
  'post_author',
  'post_date',
  'post_date_gmt',
  'post_content',
  'post_title',
  'post_excerpt',
  'post_status',
  'comment_status',
  'ping_status',
  'post_password',
  'post_name',
  'to_ping',
  'pinged',
  'post_modified',
  'post_modified_gmt',
  'post_content_filtered',
  'post_parent',
  'guid',
  'menu_order',
  'post_type',
  'post_mime_type',
  'comment_count',
];

const META_COLUMNS = ['meta_id', 'post_id', 'meta_key', 'meta_value'];
const TERM_COLUMNS = ['term_id', 'name', 'slug', 'term_group'];
const TAXONOMY_COLUMNS = [
  'term_taxonomy_id',
  'term_id',
  'taxonomy',
  'description',
  'parent',
  'count',
];
const RELATIONSHIP_COLUMNS = ['object_id', 'term_taxonomy_id', 'term_order'];

function toInt(value: string | undefined, fallback = 0): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Load a `mysqldump` file into an in-memory WordPress model. */
export function loadDatabase(sql: string): WpDatabase {
  const posts = new Map<number, WpPost>();

  for (const row of readTable(sql, 'wp_posts', POST_COLUMNS)) {
    const id = toInt(row['ID']);
    posts.set(id, {
      id,
      author: toInt(row['post_author']),
      date: row['post_date'] ?? '',
      dateGmt: row['post_date_gmt'] ?? '',
      content: row['post_content'] ?? '',
      title: row['post_title'] ?? '',
      excerpt: row['post_excerpt'] ?? '',
      status: row['post_status'] ?? '',
      name: row['post_name'] ?? '',
      parent: toInt(row['post_parent']),
      guid: row['guid'] ?? '',
      menuOrder: toInt(row['menu_order']),
      type: row['post_type'] ?? '',
      mimeType: row['post_mime_type'] ?? '',
    });
  }

  const meta = new Map<number, Map<string, string>>();
  for (const row of readTable(sql, 'wp_postmeta', META_COLUMNS)) {
    const postId = toInt(row['post_id']);
    const key = row['meta_key'] ?? '';
    if (!postId || !key) continue;
    const bucket = meta.get(postId) ?? new Map<string, string>();
    if (!bucket.has(key)) bucket.set(key, row['meta_value'] ?? '');
    meta.set(postId, bucket);
  }

  const terms = new Map<number, WpTerm>();
  for (const row of readTable(sql, 'wp_terms', TERM_COLUMNS)) {
    const id = toInt(row['term_id']);
    terms.set(id, { id, name: row['name'] ?? '', slug: row['slug'] ?? '' });
  }

  const taxonomies = new Map<number, WpTaxonomy>();
  for (const row of readTable(sql, 'wp_term_taxonomy', TAXONOMY_COLUMNS)) {
    const termTaxonomyId = toInt(row['term_taxonomy_id']);
    taxonomies.set(termTaxonomyId, {
      termTaxonomyId,
      termId: toInt(row['term_id']),
      taxonomy: row['taxonomy'] ?? '',
      description: row['description'] ?? '',
      parent: toInt(row['parent']),
      count: toInt(row['count']),
    });
  }

  const relationships = new Map<number, Array<{ termId: number; taxonomy: string }>>();
  for (const row of readTable(sql, 'wp_term_relationships', RELATIONSHIP_COLUMNS)) {
    const objectId = toInt(row['object_id']);
    const termTaxonomyId = toInt(row['term_taxonomy_id']);
    const taxonomy = taxonomies.get(termTaxonomyId);
    if (!objectId || !taxonomy) continue;
    const bucket = relationships.get(objectId) ?? [];
    bucket.push({ termId: taxonomy.termId, taxonomy: taxonomy.taxonomy });
    relationships.set(objectId, bucket);
  }

  const attachments = new Map<number, WpAttachment>();
  for (const post of posts.values()) {
    if (post.type !== 'attachment') continue;
    const postMeta = meta.get(post.id);
    const file = postMeta?.get('_wp_attached_file') ?? '';
    attachments.set(post.id, {
      id: post.id,
      title: post.title,
      file,
      url: post.guid,
      mime: post.mimeType,
      alt: postMeta?.get('_wp_attachment_image_alt') ?? '',
    });
  }

  return { posts, meta, terms, taxonomies, relationships, attachments };
}

/** Read a single post meta value. */
export function getMeta(db: WpDatabase, postId: number, key: string): string {
  return db.meta.get(postId)?.get(key) ?? '';
}

/** Every published post of a given type, newest first. */
export function publishedPosts(db: WpDatabase, type: string): WpPost[] {
  return [...db.posts.values()]
    .filter((post) => post.type === type && post.status === 'publish')
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** The published page with a given slug. */
export function pageBySlug(db: WpDatabase, slug: string): WpPost | undefined {
  return [...db.posts.values()].find(
    (post) => post.type === 'page' && post.status === 'publish' && post.name === slug,
  );
}

/* -------------------------------------------------------------------------- */
/* Elementor                                                                  */
/* -------------------------------------------------------------------------- */

export interface ElementorNode {
  elType: string;
  widgetType?: string;
  settings?: Record<string, unknown>;
  elements?: ElementorNode[];
}

export interface ElementorWidget {
  type: string;
  settings: Record<string, unknown>;
}

/** Parse the `_elementor_data` JSON of a post into a node tree. */
export function parseElementor(raw: string): ElementorNode[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ElementorNode[]) : [];
  } catch {
    return [];
  }
}

/** Flatten an Elementor tree into the list of widgets it contains. */
export function elementorWidgets(nodes: ElementorNode[]): ElementorWidget[] {
  const widgets: ElementorWidget[] = [];

  const walk = (list: ElementorNode[]) => {
    for (const node of list) {
      if (node.elType === 'widget') {
        widgets.push({
          type: node.widgetType ?? 'unknown',
          settings: node.settings ?? {},
        });
      }
      if (Array.isArray(node.elements)) walk(node.elements);
    }
  };

  walk(nodes);
  return widgets;
}

/**
 * Elementor stores most values as JSON-encoded strings inside the settings
 * object. This decodes them when possible.
 */
export function decodeSetting(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (
    !trimmed.startsWith('"') &&
    !trimmed.startsWith('[') &&
    !trimmed.startsWith('{')
  ) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

/** Read a setting as a plain string. */
export function settingString(settings: Record<string, unknown>, key: string): string {
  const value = decodeSetting(settings[key]);
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return String(value);
}

/** Read a setting as a number. */
export function settingNumber(settings: Record<string, unknown>, key: string): number {
  const value = decodeSetting(settings[key]);
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Read a setting as an array (JSON-decoded when needed). */
export function settingArray(
  settings: Record<string, unknown>,
  key: string,
): unknown[] {
  const value = decodeSetting(settings[key]);
  return Array.isArray(value) ? value : [];
}

/** Read a setting as a plain object (JSON-decoded when needed). */
export function settingObject(
  settings: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = decodeSetting(settings[key]);
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** The URL of an Elementor image setting. */
export function settingImage(settings: Record<string, unknown>, key = 'image'): string {
  const raw = decodeSetting(settings[key]);
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const url = (raw as { url?: unknown }).url;
    if (typeof url === 'string') return url;
  }
  return '';
}

/** The alt text of an Elementor image setting. */
export function settingImageAlt(
  settings: Record<string, unknown>,
  key = 'image',
): string {
  const raw = decodeSetting(settings[key]);
  if (raw && typeof raw === 'object') {
    const alt = (raw as { alt?: unknown }).alt;
    if (typeof alt === 'string') return alt;
  }
  return '';
}

/** The target URL of an Elementor link setting. */
export function settingLink(settings: Record<string, unknown>, key = 'link'): string {
  const raw = decodeSetting(settings[key]);
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const url = (raw as { url?: unknown }).url;
    if (typeof url === 'string') return url;
  }
  return '';
}

export interface ElementorImage {
  /** The WordPress attachment id, when the image comes from the media library. */
  id?: number;
  url: string;
  alt: string;
}

/** The full description of an Elementor image setting. */
export function settingImageInfo(
  settings: Record<string, unknown>,
  key = 'image',
): ElementorImage {
  const raw = decodeSetting(settings[key]);

  if (typeof raw === 'string') {
    return { url: raw, alt: '' };
  }

  if (!raw || typeof raw !== 'object') {
    return { url: '', alt: '' };
  }

  const record = raw as Record<string, unknown>;
  const rawId = record['id'];
  const id =
    typeof rawId === 'string'
      ? Number.parseInt(rawId, 10)
      : typeof rawId === 'number'
        ? rawId
        : undefined;

  return {
    id: id !== undefined && Number.isFinite(id) ? id : undefined,
    url: typeof record['url'] === 'string' ? record['url'] : '',
    alt: typeof record['alt'] === 'string' ? record['alt'] : '',
  };
}
