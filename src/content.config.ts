import { glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { locales } from './lib/locales.ts';

/**
 * Content collections.
 *
 * Every collection is a flat glob over `src/content/<locale>/<type>/*.md`.
 * The folder name is the source of truth for the locale; the `locale` key in
 * the frontmatter is kept in sync by `tests/content.test.ts`, which fails if
 * the two disagree.
 *
 * The `blocks` union below mirrors `src/lib/blocks.ts` — the shared contract
 * between the content schema and the WordPress importer.
 */

const localeSchema = z.enum(locales);

/**
 * Entry IDs keep the folder structure — `es/pages/inicio` — so the same slug
 * can exist in several languages without colliding.
 *
 * This has to be explicit: the default id of the glob loader is the `slug`
 * of the frontmatter, which would be identical in every language.
 */
const contentId = ({
  entry,
}: {
  entry: string;
  base: URL;
  data: Record<string, unknown>;
}): string => entry.replace(/\\/g, '/').replace(/\.(md|mdx)$/i, '');

const linkSchema = z.object({
  label: z.string(),
  href: z.string(),
});

const seoSchema = z.object({
  title: z.string().max(120).optional(),
  description: z.string().max(320).optional(),
  ogImage: z.string().optional(),
  noindex: z.boolean().optional(),
});

const imageSchema = z.object({
  src: z.string(),
  alt: z.string().default(''),
  width: z.number().optional(),
  height: z.number().optional(),
});

const blockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hero'),
    eyebrow: z.string().optional(),
    title: z.string(),
    text: z.string().optional(),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    slogans: z.array(z.string()).optional(),
    buttons: z.array(linkSchema).default([]),
  }),
  z.object({
    type: z.literal('stats'),
    items: z.array(z.object({ value: z.string(), label: z.string() })),
  }),
  z.object({
    type: z.literal('programs'),
    title: z.string().optional(),
    intro: z.string().optional(),
    programs: z.array(z.string()).default([]),
  }),
  z.object({
    type: z.literal('cards'),
    title: z.string().optional(),
    intro: z.string().optional(),
    items: z.array(
      z.object({
        title: z.string(),
        text: z.string().optional(),
        image: z.string().optional(),
        imageAlt: z.string().optional(),
        href: z.string().optional(),
        icon: z.string().optional(),
      }),
    ),
  }),
  z.object({
    type: z.literal('imageText'),
    title: z.string().optional(),
    text: z.string(),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    reverse: z.boolean().default(false),
    buttons: z.array(linkSchema).default([]),
  }),
  z.object({
    type: z.literal('accordion'),
    title: z.string().optional(),
    items: z.array(z.object({ title: z.string(), text: z.string() })),
  }),
  z.object({
    type: z.literal('tabs'),
    title: z.string().optional(),
    items: z.array(z.object({ title: z.string(), html: z.string() })),
  }),
  z.object({
    type: z.literal('list'),
    title: z.string().optional(),
    intro: z.string().optional(),
    items: z.array(z.string()),
  }),
  z.object({
    type: z.literal('testimonial'),
    title: z.string().optional(),
    items: z.array(
      z.object({
        quote: z.string(),
        author: z.string().optional(),
        role: z.string().optional(),
        image: z.string().optional(),
      }),
    ),
  }),
  z.object({
    type: z.literal('social'),
    title: z.string().optional(),
  }),
  z.object({
    type: z.literal('video'),
    title: z.string().optional(),
    youtubeId: z.string(),
  }),
  z.object({
    type: z.literal('gallery'),
    title: z.string().optional(),
    images: z.array(imageSchema),
  }),
  z.object({
    type: z.literal('latestPosts'),
    title: z.string().optional(),
    limit: z.number().default(3),
  }),
  z.object({
    type: z.literal('form'),
    form: z.enum(['contact', 'donar', 'voluntariado', 'newsletter']),
  }),
  z.object({
    type: z.literal('cta'),
    title: z.string(),
    text: z.string().optional(),
    buttons: z.array(linkSchema).default([]),
  }),
  z.object({
    type: z.literal('map'),
    title: z.string().optional(),
    query: z.string(),
    zoom: z.number().optional(),
  }),
  z.object({
    type: z.literal('team'),
    title: z.string().optional(),
    intro: z.string().optional(),
  }),
  z.object({
    type: z.literal('progress'),
    label: z.string().optional(),
    percentage: z.number(),
  }),
  z.object({
    type: z.literal('richText'),
    html: z.string(),
  }),
]);

const pages = defineCollection({
  loader: glob({ base: './src/content', pattern: '*/pages/*.md', generateId: contentId }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    locale: localeSchema,
    /** Position in the main navigation. Lower comes first. */
    order: z.number().default(100),
    /** Show this page in the main navigation menu. */
    nav: z.boolean().default(false),
    /** Override the navigation label (defaults to the page title). */
    navLabel: z.string().optional(),
    /** Slug of the parent navigation item. */
    navParent: z.string().optional(),
    description: z.string().optional(),
    /** Path of the page in the original WordPress site, used for redirects. */
    legacyPath: z.string().optional(),
    seo: seoSchema.optional(),
    /** Skip machine translation for this page (ethics policy, donation notes…). */
    noAutoTranslate: z.boolean().default(false),
    blocks: z.array(blockSchema).default([]),
  }),
});

const posts = defineCollection({
  loader: glob({ base: './src/content', pattern: '*/posts/*.md', generateId: contentId }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    locale: localeSchema,
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    excerpt: z.string().optional(),
    author: z.string().optional(),
    /** Category slugs (from the `categories` collection). */
    categories: z.array(z.string()).default([]),
    /** Tag slugs (from the `tags` collection). */
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    /** Path of the post in the original WordPress site, used for redirects. */
    legacyPath: z.string().optional(),
    seo: seoSchema.optional(),
    noAutoTranslate: z.boolean().default(false),
  }),
});

const categories = defineCollection({
  loader: glob({ base: './src/content', pattern: '*/categories/*.md', generateId: contentId }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    locale: localeSchema,
    description: z.string().optional(),
    order: z.number().default(100),
  }),
});

const tags = defineCollection({
  loader: glob({ base: './src/content', pattern: '*/tags/*.md', generateId: contentId }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    locale: localeSchema,
  }),
});

const programs = defineCollection({
  loader: glob({ base: './src/content', pattern: '*/programs/*.md', generateId: contentId }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    locale: localeSchema,
    summary: z.string().optional(),
    icon: z.string().optional(),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    order: z.number().default(100),
  }),
});

const team = defineCollection({
  loader: glob({ base: './src/content', pattern: '*/team/*.md', generateId: contentId }),
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    locale: localeSchema,
    role: z.string().optional(),
    bio: z.string().optional(),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    order: z.number().default(100),
  }),
});

export const collections = { pages, posts, categories, tags, programs, team };
