/**
 * A tiny HTML → Markdown converter.
 *
 * The WordPress posts are Gutenberg output, which is well-formed and
 * predictable, so a focused converter is enough — and it keeps the migration
 * free of extra dependencies.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  ldquo: '"',
  rdquo: '"',
  lsquo: "'",
  rsquo: "'",
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  middot: '·',
  bull: '•',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
  ntilde: 'ñ',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
};

/** Decode the HTML entities that actually appear in the WordPress content. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named ?? match;
  });
}

/** Remove every tag and return plain text. */
export function stripHtml(html: string): string {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Attributes of a tag, as a plain object. */
function readAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag)) !== null) {
    const name = (match[1] ?? '').toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? '';
    attributes[name] = decodeEntities(value);
  }

  return attributes;
}

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody',
  'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);

/**
 * Convert an HTML fragment into Markdown.
 *
 * Images, links, headings, lists, quotes and emphasis are preserved; the
 * `data-*` attributes WordPress sprinkles everywhere are dropped.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';

  let source = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');

  const tokens = source.match(/<[^>]+>|[^<]+/g) ?? [];
  const out: string[] = [];
  const listStack: Array<'ul' | 'ol'> = [];
  let inPre = false;

  const breakBlock = () => {
    const last = out[out.length - 1];
    if (last !== undefined && last !== '') out.push('');
  };

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex] ?? '';
    if (!token.startsWith('<')) {
      if (inPre) {
        out.push(token);
      } else {
        out.push(decodeEntities(token).replace(/\s+/g, ' '));
      }
      continue;
    }

    const isClosing = token.startsWith('</');
    const nameMatch = /^<\/?\s*([a-zA-Z0-9-]+)/.exec(token);
    const name = (nameMatch?.[1] ?? '').toLowerCase();

    if (name === 'pre') {
      inPre = !isClosing;
      if (!isClosing) out.push('\n```\n');
      else out.push('\n```\n');
      continue;
    }

    if (name === 'br') {
      out.push('\n');
      continue;
    }

    if (name === 'hr') {
      breakBlock();
      out.push('---');
      breakBlock();
      continue;
    }

    if (name === 'img') {
      const attributes = readAttributes(token);
      const src = attributes['src'] ?? '';
      const alt = (attributes['alt'] ?? '').replace(/[[\]]/g, '');
      if (src) out.push(`![${alt}](${src})`);
      continue;
    }

    if (name === 'a') {
      const attributes = readAttributes(token);
      const href = attributes['href'] ?? '';
      const inner = readUntilClosingTag(tokens, tokenIndex);
      if (href) {
        out.push(`[${inner.replace(/\s+/g, ' ').trim()}](${href})`);
      } else {
        out.push(inner);
      }
      continue;
    }

    if (name === 'strong' || name === 'b') {
      out.push(isClosing ? '**' : '**');
      continue;
    }

    if (name === 'em' || name === 'i') {
      out.push(isClosing ? '*' : '*');
      continue;
    }

    if (name === 'code') {
      out.push(isClosing ? '`' : '`');
      continue;
    }

    if (name === 'blockquote') {
      breakBlock();
      out.push('> ');
      continue;
    }

    if (name === 'li') {
      breakBlock();
      const kind = listStack[listStack.length - 1] ?? 'ul';
      out.push(kind === 'ol' ? '1. ' : '- ');
      continue;
    }

    if (name === 'ul' || name === 'ol') {
      if (isClosing) {
        listStack.pop();
        breakBlock();
      } else {
        listStack.push(name);
      }
      continue;
    }

    if (/^h[1-6]$/.test(name)) {
      breakBlock();
      if (!isClosing) out.push(`${'#'.repeat(Number(name.slice(1)))} `);
      continue;
    }

    if (BLOCK_TAGS.has(name)) {
      breakBlock();
      continue;
    }
  }

  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n')
    .trim();
}

/** Collect the raw text between a tag and its matching closing tag. */
function readUntilClosingTag(tokens: string[], start: number): string {
  const opening = tokens[start] ?? '';
  const nameMatch = /^<\s*([a-zA-Z0-9-]+)/.exec(opening);
  const name = nameMatch?.[1] ?? '';
  if (!name) return '';

  let depth = 1;
  let text = '';

  for (let i = start + 1; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';
    if (!token.startsWith('<')) {
      text += token;
      continue;
    }
    const tokenName = /^<\/?\s*([a-zA-Z0-9-]+)/.exec(token)?.[1]?.toLowerCase();
    if (tokenName !== name) continue;
    if (token.startsWith('</')) {
      depth -= 1;
      if (depth === 0) return text;
    } else if (!token.endsWith('/>')) {
      depth += 1;
    }
  }

  return text;
}

/** Collapse a string into a single line of text. */
export function oneLine(value: string): string {
  return stripHtml(value).replace(/\s+/g, ' ').trim();
}

/**
 * Remove the editor bookkeeping attributes WordPress and Elementor leave in
 * the markup (`data-start`, `data-pm-slice`, …).
 */
export function cleanHtml(html: string): string {
  return html
    .replace(/\sdata-(start|end|pm-slice|pm-allowdown|pm-allowdown)="[^"]*"/g, '')
    .replace(/\sdata-pm-slice="[^"]*"/g, '')
    .trim();
}

/** Remove the WordPress placeholder copy that was never replaced. */
export function stripPlaceholders(value: string): string {
  return value
    .replace(/\s*Lorem ipsum dolor sit amet[\s\S]*$/i, '')
    .replace(/\s*consectetur adipiscing elit[\s\S]*$/i, '')
    .trim();
}

/**
 * Build the short summary of a post.
 *
 * WordPress only stores an excerpt when it was written by hand. Everything
 * else falls back to the beginning of the body — but a raw cut leaves the
 * reader with a half-URL, so the images are dropped first and the text is
 * cut on a word boundary.
 */
export function buildExcerpt(body: string, maxLength = 200): string {
  const plain = body
    // Images first: their URLs are long and mean nothing in a summary.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    // Keep the label of a link, drop its address.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plain.length <= maxLength) return plain;

  const cut = plain.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');

  // Never cut in the middle of a word, unless the word is absurdly long.
  const sentence = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;

  return `${sentence.trimEnd()}…`;
}
