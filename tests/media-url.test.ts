import { expect, it } from 'vitest';
import { markdownToHtml } from 'satteri';
import { createMediaUrlOptions, resolveMediaUrl } from '../src/lib/media-url.ts';
import { rewriteMediaHtml } from '../src/lib/media-html.ts';
import { rehypeMediaUrls, rewriteHastMediaUrls } from '../src/lib/rehype-media.ts';

const R2_BASE = 'https://pub-example.r2.dev';
const WP_BASE = 'https://fundacionrosariogaton.org/wp-content/uploads';

it('uses WebP variants for owned relative and absolute WordPress image paths', () => {
  const options = createMediaUrlOptions(R2_BASE);

  expect(resolveMediaUrl('2025/07/photo.jpg', options)).toBe(
    `${R2_BASE}/2025/07/photo-1600w.webp`,
  );
  expect(
    resolveMediaUrl(
      'https://www.fundacionrosariogaton.org/wp-content/uploads/2025/07/photo.png',
      options,
    ),
  ).toBe(`${R2_BASE}/2025/07/photo-1600w.webp`);
  expect(
    resolveMediaUrl(
      '//fundacionrosariogaton.org/wp-content/uploads/2025/07/photo.webp',
      options,
    ),
  ).toBe(`${R2_BASE}/2025/07/photo-1600w.webp`);
});

it('keeps third-party media unchanged and preserves unsupported file formats', () => {
  const options = createMediaUrlOptions(R2_BASE);

  expect(resolveMediaUrl('https://images.example/photo.jpg', options)).toBe(
    'https://images.example/photo.jpg',
  );
  expect(resolveMediaUrl('2025/07/guide.pdf', options)).toBe(
    `${R2_BASE}/2025/07/guide.pdf`,
  );
});

it('keeps original formats when no migrated media base is configured', () => {
  const options = createMediaUrlOptions();

  expect(options).toEqual({ baseUrl: WP_BASE, useWebp: false });
  expect(resolveMediaUrl('2025/07/photo.jpg', options)).toBe(
    `${WP_BASE}/2025/07/photo.jpg`,
  );
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
          src: 'https://fundacionrosariogaton.org/wp-content/uploads/2025/07/photo.jpg',
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
  expect(children[0]?.properties['src']).toBe(`${R2_BASE}/2025/07/photo-1600w.webp`);
  expect(children[1]?.properties['href']).toBe(
    'https://fundacionrosariogaton.org/wp-content/uploads/2025/07/photo.jpg',
  );
  expect(children[2]?.properties['src']).toBe('https://images.example/external.jpg');
});

it('registers the image transformer with the actual Sätteri processor', () => {
  const options = createMediaUrlOptions(R2_BASE);
  const { html } = markdownToHtml(
    '![Photo](https://fundacionrosariogaton.org/wp-content/uploads/2025/07/photo.jpg)',
    { hastPlugins: [rehypeMediaUrls(options)] },
  );

  expect(html).toContain(`src="${R2_BASE}/2025/07/photo-1600w.webp"`);
});

it('rewrites HTML image src and srcset attributes while preserving third-party media', () => {
  const options = createMediaUrlOptions(R2_BASE);
  const html =
    '<p><img src="https://fundacionrosariogaton.org/wp-content/uploads/2025/07/photo.jpg" srcset="https://fundacionrosariogaton.org/wp-content/uploads/2025/07/photo.jpg 1x, https://images.example/other.jpg 2x"></p>';

  expect(rewriteMediaHtml(html, options)).toBe(
    `<p><img src="${R2_BASE}/2025/07/photo-1600w.webp" srcset="${R2_BASE}/2025/07/photo-1600w.webp 1x, https://images.example/other.jpg 2x"></p>`,
  );
});
