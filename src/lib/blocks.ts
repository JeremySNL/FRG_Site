/**
 * The declarative block model.
 *
 * A page is a list of blocks; each block renders one component in
 * `src/components/blocks/`. Keeping the structure in content (rather than in
 * templates) means a page can be re-arranged by editing YAML.
 *
 * These types are the shared contract between:
 *  - `src/content.config.ts` (the Zod schema that validates content)
 *  - `scripts/extract-wp.mts` (the WordPress importer)
 *
 * `tests/blocks.test.ts` asserts that both sides describe the same set of
 * block types.
 */

export interface Link {
  label: string;
  href: string;
}

export interface ImageRef {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface HeroBlock {
  type: 'hero';
  eyebrow?: string;
  title: string;
  text?: string;
  image?: string;
  imageAlt?: string;
  /** Short slogans shown next to the hero title. */
  slogans?: string[];
  buttons: Link[];
}

export interface StatsBlock {
  type: 'stats';
  items: Array<{ value: string; label: string }>;
}

export interface ProgramsBlock {
  type: 'programs';
  title?: string;
  intro?: string;
  /** Slugs from the `programs` collection. */
  programs: string[];
}

export interface CardsBlock {
  type: 'cards';
  title?: string;
  intro?: string;
  items: Array<{
    title: string;
    text?: string;
    image?: string;
    imageAlt?: string;
    href?: string;
    icon?: string;
  }>;
}

export interface ImageTextBlock {
  type: 'imageText';
  title?: string;
  text: string;
  image?: string;
  imageAlt?: string;
  /** Flips the image and the text on wide screens. Defaults to `false`. */
  reverse?: boolean;
  buttons: Link[];
}

export interface AccordionBlock {
  type: 'accordion';
  title?: string;
  items: Array<{ title: string; text: string }>;
}

export interface TabsBlock {
  type: 'tabs';
  title?: string;
  items: Array<{ title: string; html: string }>;
}

export interface ListBlock {
  type: 'list';
  title?: string;
  intro?: string;
  items: string[];
}

export interface TestimonialBlock {
  type: 'testimonial';
  title?: string;
  items: Array<{
    quote: string;
    author?: string;
    role?: string;
    image?: string;
  }>;
}

export interface SocialBlock {
  type: 'social';
  title?: string;
}

export interface VideoBlock {
  type: 'video';
  title?: string;
  youtubeId: string;
}

export interface GalleryBlock {
  type: 'gallery';
  title?: string;
  images: ImageRef[];
}

export interface LatestPostsBlock {
  type: 'latestPosts';
  title?: string;
  limit: number;
}

export interface FormBlock {
  type: 'form';
  form: 'contact' | 'donar' | 'voluntariado' | 'newsletter';
}

export interface CtaBlock {
  type: 'cta';
  title: string;
  text?: string;
  buttons: Link[];
}

export interface MapBlock {
  type: 'map';
  title?: string;
  query: string;
  zoom?: number;
}

export interface TeamBlock {
  type: 'team';
  title?: string;
  intro?: string;
}

export interface ProgressBlock {
  type: 'progress';
  label?: string;
  percentage: number;
}

export interface RichTextBlock {
  type: 'richText';
  html: string;
}

export type Block =
  | HeroBlock
  | StatsBlock
  | ProgramsBlock
  | CardsBlock
  | ImageTextBlock
  | AccordionBlock
  | TabsBlock
  | ListBlock
  | TestimonialBlock
  | SocialBlock
  | VideoBlock
  | GalleryBlock
  | LatestPostsBlock
  | FormBlock
  | CtaBlock
  | MapBlock
  | TeamBlock
  | ProgressBlock
  | RichTextBlock;

/** Every block type name, in a stable order. */
export const blockTypes = [
  'hero',
  'stats',
  'programs',
  'cards',
  'imageText',
  'accordion',
  'tabs',
  'list',
  'testimonial',
  'social',
  'video',
  'gallery',
  'latestPosts',
  'form',
  'cta',
  'map',
  'team',
  'progress',
  'richText',
] as const satisfies readonly Block['type'][];

export type BlockType = (typeof blockTypes)[number];

/** Narrow an unknown value to a `Block`. */
export function isBlock(value: unknown): value is Block {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && (blockTypes as readonly string[]).includes(type);
}
