import { expect, it } from 'vitest';
import { markdownToHtml } from 'satteri';
import { createMediaUrlOptions, resolveMediaUrl } from '../src/lib/media-url.ts';
import { rewriteMediaHtml } from '../src/lib/media-html.ts';
import { rehypeMediaUrls, rewriteHastMediaUrls } from '../src/lib/rehype-media.ts';

const R2_BASE = 'https://pub-example.r2.dev';
const R2_CUSTOM_BASE = 'https://media.fundacionrosariogaton.org';

it('serves delivery keys from the bucket exactly as written', () => {
  const options = createMediaUrlOptions(R2_BASE);

  expect(resolveMediaUrl('photos/2026-10-23-asamblea-extraordinaria-2026/01.webp', options)).toBe(
    `${R2_BASE}/photos/2026-10-23-asamblea-extraordinaria-2026/01.webp`,
  );
  expect(resolveMediaUrl('brand/logo.webp', options)).toBe(`${R2_BASE}/brand/logo.webp`);
  expect(resolveMediaUrl('programs/vivienda-digna/cover.webp', options)).toBe(
    `${R2_BASE}/programs/vivienda-digna/cover.webp`,
  );
});

it('maps absolute WordPress upload URLs to their migrated key', () => {
  const options = createMediaUrlOptions(R2_BASE);

  expect(
    resolveMediaUrl(
      'https://www.fundacionrosariogaton.org/wp-content/uploads/2025/07/photo.jpg',
      options,
    ),
  ).toBe(`${R2_BASE}/2025/07/photo.jpg`);
  expect(
    resolveMediaUrl('//fundacionrosariogaton.org/wp-content/uploads/2025/07/photo.webp', options),
  ).toBe(`${R2_BASE}/2025/07/photo.webp`);
});

it('keeps third-party media unchanged and preserves unsupported file formats', () => {
  const options = createMediaUrlOptions(R2_BASE);

  expect(resolveMediaUrl('https://images.example/photo.jpg', options)).toBe(
    'https://images.example/photo.jpg',
  );
  expect(resolveMediaUrl('docs/guide.pdf', options)).toBe(`${R2_BASE}/docs/guide.pdf`);
});

it('defaults to the media custom domain when nothing is configured', () => {
  const options = createMediaUrlOptions();

  expect(options).toEqual({ baseUrl: R2_CUSTOM_BASE });
  expect(resolveMediaUrl('brand/logo.webp', options)).toBe(`${R2_CUSTOM_BASE}/brand/logo.webp`);
});

it('uses the configured media host when one is provided', () => {
  const options = createMediaUrlOptions(`${R2_CUSTOM_BASE}/`);

  expect(options).toEqual({ baseUrl: R2_CUSTOM_BASE });
});

it('rewrites Markdown HAST image sources but not external links', () => {
  const options = createMediaUrlOptions(R2_BASE);
  const tree = {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'img',
        properties: {
          src: 'photos/2026-10-23-asamblea-extraordinaria-2026/01.webp',
          alt: 'Photo',
        },
        children: [],
      },
      {
        type: 'element',
        tagName: 'a',
        properties: {
          href: 'https://fundacionrosariogaton.org/wp-content/uploads/2025/07/photo.jpg',
        },
        children: [],
      },
      {
        type: 'element',
        tagName: 'img',
        properties: { src: 'https://images.example/external.jpg' },
        children: [],
      },
    ],
  };

  rewriteHastMediaUrls(tree, options);

  const children = tree.children;
  expect(children[0]?.properties['src']).toBe(
    `${R2_BASE}/photos/2026-10-23-asamblea-extraordinaria-2026/01.webp`,
  );
  expect(children[1]?.properties['href']).toBe(
    'https://fundacionrosariogaton.org/wp-content/uploads/2025/07/photo.jpg',
  );
  expect(children[2]?.properties['src']).toBe('https://images.example/external.jpg');
});

it('registers the image transformer with the actual Satteri processor', () => {
  const options = createMediaUrlOptions(R2_BASE);
  const { html } = markdownToHtml('![Photo](photos/2026-10-23-asamblea/01.webp)', {
    hastPlugins: [rehypeMediaUrls(options)],
  });

  expect(html).toContain(`src="${R2_BASE}/photos/2026-10-23-asamblea/01.webp"`);
});

it('rewrites HTML image src and srcset attributes while preserving third-party media', () => {
  const options = createMediaUrlOptions(R2_BASE);
  const html =
    '<p><img src="photos/2026-10-23-asamblea/01.webp" srcset="photos/2026-10-23-asamblea/01.webp 1x, https://images.example/other.jpg 2x"></p>';

  expect(rewriteMediaHtml(html, options)).toBe(
    `<p><img src="${R2_BASE}/photos/2026-10-23-asamblea/01.webp" srcset="${R2_BASE}/photos/2026-10-23-asamblea/01.webp 1x, https://images.example/other.jpg 2x"></p>`,
  );
});
