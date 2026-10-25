import { expect, it } from 'vitest';
import {
  collectRelativeMediaPaths,
  collectMarkdownMediaReferences,
  extractSiteLogoPath,
  webpVariantKey,
} from '../scripts/lib/media.ts';
import {
  buildUploadKeyManifest,
  isMatchingR2Etag,
  isValidR2PublicUrl,
} from '../scripts/lib/r2.ts';

it('collects relative media paths from nested frontmatter fields', () => {
  const paths = collectRelativeMediaPaths({
    image: '2025/07/hero.jpg',
    blocks: [
      { type: 'imageText', image: '2025/07/about.png' },
      { type: 'gallery', images: [{ src: '2025/07/gallery.webp', alt: 'Gallery' }] },
    ],
  });

  expect(paths).toEqual([
    '2025/07/hero.jpg',
    '2025/07/about.png',
    '2025/07/gallery.webp',
  ]);
});

it('collects string values from media-bearing frontmatter arrays', () => {
  expect(
    collectRelativeMediaPaths({
      image: ['2025/07/first.jpg', '2025/07/second.png'],
    }),
  ).toEqual(['2025/07/first.jpg', '2025/07/second.png']);
});

it('ignores URLs, empty paths, and non-media identifiers', () => {
  const paths = collectRelativeMediaPaths({
    image: 'https://example.com/remote.jpg',
    href: '2025/07/not-an-image.jpg',
    src: '',
    blocks: [
      { backgroundImage: '//example.com/protocol-relative.jpg' },
      { backgroundImage: '2025/07/background.mp4' },
    ],
  });

  expect(paths).toEqual(['2025/07/background.mp4']);
});

it('rejects media keys that could escape the WordPress uploads directory', () => {
  const paths = collectRelativeMediaPaths({
    image: '../../private/photo.jpg',
    backgroundImage: '2025/07/../../private/photo.jpg',
    src: 'C:\\private\\photo.png',
  });

  expect(paths).toEqual([]);
});

it('creates stable WebP variant keys for supported raster formats only', () => {
  expect(webpVariantKey('2025/07/photo.jpg')).toBe('2025/07/photo-1600w.webp');
  expect(webpVariantKey('2025/07/photo.jpeg')).toBe('2025/07/photo-1600w.webp');
  expect(webpVariantKey('2025/07/photo.png')).toBe('2025/07/photo-1600w.webp');
  expect(webpVariantKey('2025/07/photo.gif')).toBeUndefined();
  expect(webpVariantKey('2025/07/guide.pdf')).toBeUndefined();
});

it('reads the site-level logo media path from the site config', () => {
  const source = `export const site = {\n  logo: '2025/07/logo.png',\n} as const;`;

  expect(extractSiteLogoPath(source)).toBe('2025/07/logo.png');
});

it('normalizes an absolute first-party WordPress logo URL', () => {
  const source = `export const site = {\n  logo: 'https://fundacionrosariogaton.org/wp-content/uploads/2025/07/logo.png',\n} as const;`;

  expect(extractSiteLogoPath(source)).toBe('2025/07/logo.png');
});

it('collects relative and owned Markdown media while leaving hotlinks external', () => {
  const references = collectMarkdownMediaReferences(`---
image: 2025/07/featured.jpg
blocks:
  - type: imageText
    image: https://fundacionrosariogaton.org/wp-content/uploads/2025/07/block.png
---
![Body](https://fundacionrosariogaton.org/wp-content/uploads/2025/07/body.jpg)
<img src="//www.fundacionrosariogaton.org/wp-content/uploads/2025/07/inline.webp">
![External](https://external.example/wp-content/uploads/2025/07/hotlink.jpg)
![Other](https://images.example/photo.jpg)
`);

  expect([...references.own].sort()).toEqual([
    '2025/07/block.png',
    '2025/07/body.jpg',
    '2025/07/featured.jpg',
    '2025/07/inline.webp',
  ]);
  expect([...references.external]).toEqual([
    'external.example/wp-content/uploads/2025/07/hotlink.jpg',
  ]);
});

it('reports malformed frontmatter while still collecting body references', () => {
  const references = collectMarkdownMediaReferences(`---
image: [unterminated
---
![Body](https://fundacionrosariogaton.org/wp-content/uploads/2025/07/body.jpg)
`);

  expect([...references.own]).toEqual(['2025/07/body.jpg']);
  expect(references.errors).toHaveLength(1);
});

it('validates public R2 URLs without accepting non-public endpoints', () => {
  expect(isValidR2PublicUrl('https://pub-example.r2.dev')).toBe(true);
  expect(isValidR2PublicUrl('http://pub-example.r2.dev')).toBe(false);
  expect(isValidR2PublicUrl('https://media.example.com')).toBe(false);
  expect(isValidR2PublicUrl('https://pub-example.r2.dev?token=value')).toBe(false);
});

it('only treats an existing R2 object as resumable when its ETag matches', () => {
  expect(
    isMatchingR2Etag(
      '"d41d8cd98f00b204e9800998ecf8427e"',
      'd41d8cd98f00b204e9800998ecf8427e',
    ),
  ).toBe(true);
  expect(isMatchingR2Etag('"different"', 'd41d8cd98f00b204e9800998ecf8427e')).toBe(
    false,
  );
  expect(isMatchingR2Etag(undefined, 'd41d8cd98f00b204e9800998ecf8427e')).toBe(false);
});

it('builds a collision-free original and WebP key manifest', () => {
  const manifest = buildUploadKeyManifest(
    ['2025/07/photo.jpg', '2025/07/logo.png'],
    true,
  );

  expect(manifest.keys).toEqual([
    '2025/07/photo.jpg',
    '2025/07/photo-1600w.webp',
    '2025/07/logo.png',
    '2025/07/logo-1600w.webp',
  ]);
  expect(manifest.collisions).toEqual([]);
});

it('detects a source key that collides with another image WebP variant', () => {
  const manifest = buildUploadKeyManifest(
    ['2025/07/photo.jpg', '2025/07/photo-1600w.webp'],
    true,
  );

  expect(manifest.collisions).toEqual(['2025/07/photo-1600w.webp']);
});

it('rejects unsafe paths before they enter the upload manifest', () => {
  expect(() => buildUploadKeyManifest(['../../private/photo.jpg'], true)).toThrow(
    'Unsafe or unsupported R2 media key',
  );
});
