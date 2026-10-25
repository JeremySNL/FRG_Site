import { defineHastPlugin } from 'satteri';
import type { MediaUrlOptions } from './media-url.ts';
import { resolveMediaUrl } from './media-url.ts';
import { rewriteSrcSet } from './media-html.ts';

type NodeRecord = Record<string, unknown>;

function isNodeRecord(value: unknown): value is NodeRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rewriteElementMediaProperties(
  node: NodeRecord,
  options: MediaUrlOptions,
): NodeRecord | undefined {
  if (
    node['type'] !== 'element' ||
    (node['tagName'] !== 'img' && node['tagName'] !== 'source') ||
    !isNodeRecord(node['properties'])
  ) {
    return undefined;
  }

  const properties = { ...node['properties'] };
  let changed = false;
  for (const name of ['src', 'data-src', 'dataSrc']) {
    const value = properties[name];
    if (typeof value === 'string') {
      const rewritten = resolveMediaUrl(value, options);
      if (rewritten !== value) {
        properties[name] = rewritten;
        changed = true;
      }
    }
  }
  for (const name of ['srcSet', 'srcset', 'data-srcset', 'dataSrcSet']) {
    const value = properties[name];
    if (typeof value === 'string') {
      const rewritten = rewriteSrcSet(value, options);
      if (rewritten !== value) {
        properties[name] = rewritten;
        changed = true;
      }
    }
  }

  return changed ? { ...node, properties } : undefined;
}

/** Rewrite first-party image URLs in a HAST tree (also used by unit tests). */
export function rewriteHastMediaUrls(tree: unknown, options: MediaUrlOptions): void {
  const visit = (node: unknown): void => {
    if (!isNodeRecord(node)) return;

    const rewritten = rewriteElementMediaProperties(node, options);
    if (rewritten) Object.assign(node, rewritten);

    const children = node['children'];
    if (Array.isArray(children)) {
      for (const child of children) visit(child);
    }
  };

  visit(tree);
}

/** Register the transformer through Sätteri's typed HAST plugin API. */
export function rehypeMediaUrls(options: MediaUrlOptions) {
  return defineHastPlugin({
    name: 'frg-r2-media-urls',
    element: {
      filter: ['img', 'source'],
      visit(node) {
        const rewritten = rewriteElementMediaProperties(
          node as unknown as NodeRecord,
          options,
        );
        if (rewritten) return rewritten as unknown as typeof node;
      },
    },
  });
}
