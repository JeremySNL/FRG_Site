import type { MediaUrlOptions } from './media-url.ts';
import { resolveMediaUrl } from './media-url.ts';

function rewriteSrcSet(value: string, options: MediaUrlOptions): string {
  if (/\bdata:/i.test(value)) return value;

  return value
    .split(',')
    .map((entry) => {
      const trimmed = entry.trim();
      if (!trimmed) return trimmed;

      const separator = trimmed.search(/\s/);
      const source = separator < 0 ? trimmed : trimmed.slice(0, separator);
      const descriptor = separator < 0 ? '' : trimmed.slice(separator);
      return `${resolveMediaUrl(source, options)}${descriptor}`;
    })
    .join(', ');
}

/** Rewrite media-bearing attributes in trusted rich-text HTML. */
export function rewriteMediaHtml(html: string, options: MediaUrlOptions): string {
  return html.replace(/<(?:img|source)\b[^>]*>/gi, (tag) =>
    tag
      .replace(
        /\b(data-src|src)\s*=\s*(["'])(.*?)\2/gi,
        (_match, name, quote, value: string) => {
          return `${name}=${quote}${resolveMediaUrl(value, options)}${quote}`;
        },
      )
      .replace(
        /\b(data-srcset|srcset)\s*=\s*(["'])(.*?)\2/gi,
        (_match, name, quote, value: string) => {
          return `${name}=${quote}${rewriteSrcSet(value, options)}${quote}`;
        },
      ),
  );
}

export { rewriteSrcSet };
