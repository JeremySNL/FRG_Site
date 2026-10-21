/**
 * The RSS feed of the blog.
 *
 * Only the Spanish feed is published — it is the source language, and the
 * machine-translated feeds would only repeat the same content.
 */
import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';

import { getPosts } from '~/lib/content.ts';
import { defaultLocale } from '~/lib/locales.ts';
import { site } from '~/lib/site.ts';

export const GET: APIRoute = async () => {
  const posts = await getPosts(defaultLocale);

  return rss({
    title: site.name,
    description: site.tagline,
    site: site.url,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.excerpt,
      pubDate: post.data.date,
      link: `/actualidades/${post.data.slug}/`,
      content: post.body,
    })),
    customData: `<language>${defaultLocale}</language>`,
  });
};
