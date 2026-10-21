import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokens } from '../design/tokens.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The design tokens live in two places: `design/tokens.ts` for the TypeScript
 * and `src/styles/global.css` for the CSS. They have to say the same thing,
 * otherwise a component gets a colour that nobody else uses.
 */

/** Normalize a value so the two spellings of the same token compare equal. */
function normalize(value: string): string {
  return value
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Read the `--name: value;` pairs of the `@theme` block of the stylesheet. */
async function themeTokens(): Promise<Map<string, string>> {
  const css = await readFile(join(root, 'src/styles/global.css'), 'utf8');

  const block = /@theme\s*\{([\s\S]*?)\n\}/.exec(css);
  if (!block?.[1]) throw new Error('The @theme block was not found in global.css.');

  const theme = new Map<string, string>();

  for (const match of block[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];

    if (name === undefined || value === undefined) continue;

    theme.set(name, value.trim());
  }

  return theme;
}

describe('the design tokens', () => {
  it('are mirrored in the stylesheet', async () => {
    const theme = await themeTokens();

    for (const [name, value] of Object.entries(tokens)) {
      const cssValue = theme.get(name);

      expect(cssValue, `--${name} is missing from the @theme block`).toBeDefined();
      expect(normalize(cssValue ?? ''), `--${name} drifted`).toBe(
        normalize(value),
      );
    }
  });

  it('do not leave anything behind in the stylesheet', async () => {
    const theme = await themeTokens();
    const known = new Set(Object.keys(tokens));

    // Tailwind's own modifiers (`--text-display-2xl--line-height`) are not
    // part of the token table.
    const unexpected = [...theme.keys()].filter(
      (name) => !name.includes('--') && !known.has(name),
    );

    expect(unexpected).toEqual([]);
  });

  it('use a colour for every colour token', async () => {
    const theme = await themeTokens();

    for (const [name, value] of Object.entries(tokens)) {
      if (!name.startsWith('color-')) continue;

      expect(value, `--${name} is not a colour`).toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(theme.get(name)?.toLowerCase()).toBe(value.toLowerCase());
    }
  });
});
