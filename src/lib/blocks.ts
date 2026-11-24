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

import type { TeamArea, TeamContinent } from './team.ts';

export interface Link {
  label: string;
  href: string;
}

/**
 * The background a block's section renders on.
 *
 * Every section block can put itself on a blue-tinted gradient band
 * (`surface: true`) or on white (`surface: false`), so a long page alternates
 * tones instead of being one white sheet. Blocks that always looked better on
 * a band (stats, programs, testimonials) default to `true`.
 */
export function sectionClass(
  surface: boolean | undefined,
  defaultSurface = false,
  tight = false,
): string {
  const toned = surface ?? defaultSurface;

  if (toned) return tight ? 'section-sweep-tight' : 'section-sweep';
  return tight ? 'section-tight' : 'section';
}

/**
 * Whether a CTA is a donation ask, so it can be painted in the brand red.
 *
 * Content editors are not forced to remember a flag: the wording already
 * says it. Add a synonym here rather than editing every component.
 */
export function isDonationCta(...parts: (string | undefined)[]): boolean {
  return /donar|donaci|aporte|donativo/i.test(parts.filter(Boolean).join(' '));
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
  /** Defaults to `true` — stats read better on the grey surface. */
  surface?: boolean;
  items: Array<{ value: string; label: string }>;
}

export interface ProgramsBlock {
  type: 'programs';
  title?: string;
  intro?: string;
  /** Defaults to `true`. */
  surface?: boolean;
  /** Slugs from the `programs` collection. */
  programs: string[];
}

export interface CardsBlock {
  type: 'cards';
  title?: string;
  intro?: string;
  /** Defaults to `false`. */
  surface?: boolean;
  items: Array<{
    title: string;
    text?: string;
    image?: string;
    imageAlt?: string;
    href?: string;
    /** Name of an icon from `src/lib/icons.ts`, shown as a badge. */
    icon?: string;
  }>;
}

export interface ImageTextBlock {
  type: 'imageText';
  title?: string;
  text: string;
  image?: string;
  imageAlt?: string;
  /** Defaults to `false`. */
  surface?: boolean;
  /** Flips the image and the text on wide screens. Defaults to `false`. */
  reverse?: boolean;
  buttons: Link[];
}

export interface AccordionBlock {
  type: 'accordion';
  title?: string;
  /** Defaults to `false`. */
  surface?: boolean;
  items: Array<{ title: string; text: string }>;
}

export interface TabsBlock {
  type: 'tabs';
  title?: string;
  /** Defaults to `false`. */
  surface?: boolean;
  items: Array<{ title: string; html: string }>;
}

export interface ListBlock {
  type: 'list';
  title?: string;
  intro?: string;
  /** Defaults to `false`. */
  surface?: boolean;
  items: string[];
}

export interface TestimonialBlock {
  type: 'testimonial';
  title?: string;
  /** Defaults to `true`. */
  surface?: boolean;
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
  /** Defaults to `false`. */
  surface?: boolean;
}

export interface VideoBlock {
  type: 'video';
  title?: string;
  /** Legacy canonical id. Either this or `url` must be provided. */
  youtubeId?: string;
  /** Full YouTube URL (watch, youtu.be, shorts, embed, live). */
  url?: string;
  /** Overrides the aspect ratio inferred from `url`. */
  aspect?: 'landscape' | 'vertical';
  /** Defaults to `false`. */
  surface?: boolean;
}

export interface GalleryBlock {
  type: 'gallery';
  title?: string;
  /** Defaults to `false`. */
  surface?: boolean;
  images: ImageRef[];
}

export interface LatestPostsBlock {
  type: 'latestPosts';
  title?: string;
  limit: number;
  /** Defaults to `false`. */
  surface?: boolean;
}

export interface FormBlock {
  type: 'form';
  form: 'contact' | 'donar' | 'voluntariado' | 'newsletter';
  /** Defaults to `false`. */
  surface?: boolean;
}

export interface CtaBlock {
  type: 'cta';
  title: string;
  text?: string;
  buttons: Link[];
  /** Defaults to `false` — the accent card pops more on white. */
  surface?: boolean;
}

export interface MapBlock {
  type: 'map';
  title?: string;
  query: string;
  zoom?: number;
  /** Defaults to `false`. */
  surface?: boolean;
}

export interface TeamBlock {
  type: 'team';
  title?: string;
  intro?: string;
  /** Defaults to `false`. */
  surface?: boolean;
}

export interface RichTextBlock {
  type: 'richText';
  html: string;
  /** Defaults to `false`. */
  surface?: boolean;
}

/**
 * The goodwill ambassadors of the home page.
 *
 * The people are not written here: the block reads them from the `team`
 * collection (the continental ambassador and the country ambassadors whose
 * `continent` matches). Only what has no person behind it lives in the block.
 */
export interface AmbassadorsBlock {
  type: 'ambassadors';
  title?: string;
  intro?: string;
  /** Defaults to `false`. */
  surface?: boolean;
  continents: Array<{
    /** Heading of the continent, in the language of the page. */
    name: string;
    /** Which `team` members belong here: their `continent` field. */
    continent: TeamContinent;
    /**
     * Countries with no ambassador yet.
     *
     * A vacancy is a country, not a person named "to be assigned": keeping it
     * as data lets the block count the open seats and link each one to the
     * volunteering form without inventing fake people in the content.
     */
    openCountries: string[];
  }>;
}

/**
 * The departments of the foundation on the home page.
 *
 * The people are not written here: the block reads the `team` documents with
 * `group: direccion` whose `area` matches. Only what has no person behind it
 * (the heading and a short description of each department) lives in the block.
 */
export interface DepartmentsBlock {
  type: 'departments';
  title?: string;
  intro?: string;
  /** Defaults to `false`. */
  surface?: boolean;
  areas: Array<{
    /** Heading of the department, in the language of the page. */
    name: string;
    /** Which `team` members belong here: their `area` field. */
    area: TeamArea;
    /** One or two sentences on what the department does. */
    description?: string;
  }>;
}

export interface HeroBentoBlock {
  type: 'heroBento';
  title: string;
  text?: string;
  backgroundImage?: string;
  backgroundImageAlt?: string;
  buttons: Link[];
  cards: Array<{
    type: 'solidBlue' | 'imageRed' | 'imageBlue' | 'solidRed';
    title: string;
    value?: string;
    /** A short line under the title saying what the card is about. */
    text?: string;
    image?: string;
    imageAlt?: string;
    /** Makes the whole card a link. */
    href?: string;
  }>;
}

export interface SplitCtaBlock {
  type: 'splitCta';
  title?: string;
  volunteer: {
    title: string;
    text?: string;
    button: Link;
    image?: string;
    imageAlt?: string;
  };
  donate: {
    title: string;
    text?: string;
    button: Link;
    image?: string;
    imageAlt?: string;
  };
}

export interface ContactSectionBlock {
  type: 'contactSection';
  title?: string;
  intro?: string;
  email?: string;
  phone?: string;
  address?: string;
  form?: 'contact';
  surface?: boolean;
}

export type Block =
  | HeroBlock
  | HeroBentoBlock
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
  | RichTextBlock
  | AmbassadorsBlock
  | DepartmentsBlock
  | SplitCtaBlock
  | ContactSectionBlock;

/** Every block type name, in a stable order. */
export const blockTypes = [
  'hero',
  'heroBento',
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
  'richText',
  'ambassadors',
  'departments',
  'splitCta',
  'contactSection',
] as const satisfies readonly Block['type'][];
